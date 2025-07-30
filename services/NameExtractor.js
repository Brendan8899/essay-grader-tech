const fs = require("fs-extra");
const path = require("path");
const sharp = require("sharp");
const vision = require("@google-cloud/vision");
const { verifyStudentName } = require("./StudentService");
const logger = require("../utils/logger.js")("NameExtractor");
const { convertPdfToBase64Images } = require("../utils/encodeToBase64");

// Initialize Google Vision client
const googleVisionClient = new vision.ImageAnnotatorClient({
  keyFilename: path.join(__dirname, "..", "google_vision.json"),
});

// Initialize OpenAI using the local module
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Crops the top 20% of an image
 * @param {string} imagePath - Path to the image file
 * @param {string} outputPath - Path to save the cropped image
 * @returns {Promise<string>} - Path to the cropped image
 */
async function cropTopOfImage(imagePath, outputPath) {
  try {
    // Normalize paths for WSL
    imagePath = imagePath.replace(/\\/g, "/");
    outputPath = outputPath.replace(/\\/g, "/");

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      logger.warn(`File does not exist: ${imagePath}`);
      throw new Error("Input file does not exist");
    }

    // Check file extension to handle different formats
    const fileExt = path.extname(imagePath).toLowerCase();
    logger.info(`Processing file: ${imagePath}, detected extension: ${fileExt || "NONE"}`);

    // Check if file is actually a PDF by examining header bytes regardless of extension
    let isPdfFile = false;
    try {
      const fileBuffer = await fs.readFile(imagePath, { encoding: null });
      // Check for PDF header signature (%PDF-)
      if (fileBuffer.length > 4 && fileBuffer.toString("ascii", 0, 5) === "%PDF-") {
        isPdfFile = true;
        logger.info(`PDF signature detected in file: ${imagePath}`);
      }
    } catch (readError) {
      logger.error(`Error reading file to check format: ${readError.message}`);
      // Continue with normal processing based on extension
    }

    // If file is a PDF by extension or content signature, we need special handling
    if (fileExt === ".pdf" || isPdfFile) {
      logger.info("PDF file detected, skipping image cropping");
      try {
        // If it's a PDF but doesn't have .pdf extension, add it to ensure proper handling
        let targetPath = outputPath;
        if (isPdfFile && !fileExt.endsWith(".pdf")) {
          targetPath = outputPath + ".pdf";
          logger.info(`Adding .pdf extension for proper handling: ${targetPath}`);
        }

        // Simply copy the file to maintain process flow
        await fs.copyFile(imagePath, targetPath);
        logger.info(`Successfully copied PDF file to ${targetPath}`);
        return targetPath;
      } catch (copyError) {
        logger.error(`Error copying PDF file from ${imagePath} to ${outputPath}:`, copyError);
        throw new Error(`Failed to process PDF file: ${copyError.message}`);
      }
    }

    // Attempt to get image metadata
    let metadata;
    try {
      metadata = await sharp(imagePath).metadata();
    } catch (metadataError) {
      logger.warn(`Cannot process image format for ${imagePath}: ${metadataError.message}`);

      // If metadata extraction fails, check again if it might be a PDF (sometimes PDFs are missed in the first check)
      try {
        const fileBuffer = await fs.readFile(imagePath, { encoding: null });
        if (fileBuffer.length > 4 && fileBuffer.toString("ascii", 0, 5) === "%PDF-") {
          logger.info(`Second check: PDF signature detected in file: ${imagePath}`);
          const pdfOutputPath = outputPath + ".pdf";
          await fs.copyFile(imagePath, pdfOutputPath);
          logger.info(`Copied as PDF after metadata failure: ${pdfOutputPath}`);
          return pdfOutputPath;
        }
      } catch (secondCheckError) {
        logger.error(`Error in second format check: ${secondCheckError.message}`);
      }

      // Default handling - just copy the file
      try {
        await fs.copyFile(imagePath, outputPath);
        logger.info(`Copied original file to ${outputPath} due to metadata extraction failure`);
        return outputPath;
      } catch (copyError) {
        logger.error(`Error copying file after metadata failure: ${copyError.message}`);
        throw new Error(
          `Failed to process image: ${metadataError.message}, and failed to copy: ${copyError.message}`
        );
      }
    }

    const { width, height } = metadata;

    // Calculate the top 20% of the image
    const cropHeight = Math.floor(height * 0.2);

    // Crop the image
    try {
      await sharp(imagePath)
        .extract({ left: 0, top: 0, width, height: cropHeight })
        .toFile(outputPath);
      logger.info(`Successfully cropped image to ${outputPath}`);
      return outputPath;
    } catch (cropError) {
      logger.error(`Error cropping image ${imagePath}:`, cropError);
      // If crop fails, try to copy the original
      try {
        await fs.copyFile(imagePath, outputPath);
        logger.info(`Copied original file to ${outputPath} due to crop failure`);
        return outputPath;
      } catch (copyError) {
        logger.error(`Error copying file after crop failure: ${copyError.message}`);
        throw new Error(`Failed to crop and failed to copy original: ${cropError.message}`);
      }
    }
  } catch (error) {
    logger.error("Error in cropTopOfImage:", error);
    throw error; // Let the caller handle the error appropriately
  }
}
/**
 * Extract student name from extracted text using OpenAI
 * @param {string} extractedText - Text extracted from cropped image
 * @returns {Promise<string>} - Extracted student name
 */
async function extractStudentNameFromText(extractedText) {
  try {
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a student name extraction specialist. 
            I'll provide you with text extracted from the top portion of a student essay or assignment.
            Your task is to identify and extract the COMPLETE student's name from this text.
            
            Common formats include:
            - "Name: John Doe"
            - "Student: Jane Smith" 
            - "NAME/INDEX NO.: Abigail Lin Huangying"
            - Or simply "John Doe" at the top
            
            Important rules:
            1. Always extract the FULL name, including ALL first names, middle names, and last names
            2. If you see multiple parts of a name (like "NAME/INDEX NO.: Abigail" followed by "Lin Huangying" on the next line), combine them into the complete name
            3. Look for name indicators like "NAME:", "Student:", "By:", etc.
            4. If multiple potential names exist, pick the most likely student name based on context
            5. Return ONLY the complete name with no additional text, labels, or punctuation
            6. If no name is found, respond with "NO_NAME_FOUND"
            
            Text from image:
            ${extractedText}
            
            COMPLETE STUDENT NAME ONLY (nothing else):`,
          },
        ],
      },
    ];

    const response = await openai.chat.completions.create({
      model: "chatgpt-4o-latest",
      messages: messages,
      temperature: 0.3,
      max_tokens: 50,
    });

    let extractedName = response.choices[0].message.content.trim();

    // Handle the no name case
    if (extractedName === "NO_NAME_FOUND") {
      return "";
    }

    return extractedName;
  } catch (error) {
    logger.error("Error extracting student name with OpenAI:", error);
    throw error;
  }
}

/**
 * Check if a student name exists in the Student database
 * @param {string} studentName - Student name to check
 * @param {string} userId - User ID
 * @param {string} className - Class name
 * @returns {Promise<{verified: boolean, exactMatch: boolean, similarMatches: Array}>}
 */
async function verifyStudentNameInDatabase(studentName, userId, className) {
  if (!studentName || !className) {
    return {
      verified: false,
      exactMatch: false,
      similarMatches: [],
      finalName: "No Name",
      requiresTeacherReview: false, // No name to verify
    };
  }

  try {
    // Use the StudentService to verify the name - direct call to maintain performance
    const verificationResult = await verifyStudentName(userId, studentName, className);

    // Add a finalName field to indicate what name should be used
    let finalName;
    let requiresTeacherReview = false;

    if (verificationResult.exactMatch) {
      // If exact match found, use the database version (with correct capitalization)
      finalName = verificationResult.student.studentName;
      requiresTeacherReview = false; // Exact match, no review needed
    } else if (verificationResult.similarMatches && verificationResult.similarMatches.length > 0) {
      // If we have similar matches but no exact match, use the highest scoring match but still require review
      finalName = verificationResult.similarMatches[0].studentName; // Use the highest scoring match
      requiresTeacherReview = true; // Fuzzy match found, still needs teacher confirmation
      logger.info(
        `Found ${verificationResult.similarMatches.length} similar matches for "${studentName}", suggesting "${finalName}" but requiring teacher review`
      );
    } else if (studentName.trim() !== "") {
      // If no match at all but we have an extracted name
      // Changed behavior: No longer automatically use the extracted name
      // Instead, set to "No Name" and require teacher confirmation
      finalName = "No Name Found In Database";
      requiresTeacherReview = true; // No match, needs teacher to confirm
      logger.info(
        `No match found for "${studentName}", setting as "No Name" pending teacher review`
      );
    } else {
      // If no name was extracted, use "No Name"
      finalName = "No Name";
      requiresTeacherReview = true;
    }

    return {
      verified: verificationResult.exactMatch, // Only truly verified with exact match
      exactMatch: verificationResult.exactMatch,
      similarMatches: verificationResult.similarMatches || [],
      finalName,
      requiresTeacherReview,
      extractedName: studentName, // Keep the extracted name for reference
      message: verificationResult.message,
    };
  } catch (error) {
    logger.error("Error verifying student name:", error);

    // If verification fails, require teacher review
    return {
      verified: false,
      exactMatch: false,
      similarMatches: [],
      finalName: "No Name",
      requiresTeacherReview: true,
      extractedName: studentName, // Keep extracted name for reference
      error: error.message,
    };
  }
}

/**
 * Process an image to extract student name and verify it against the database
 * @param {string} filePath - Path to the PDF file
 * @param {string} outputBasePath - Base path for temporary files
 * @param {string} userId - User ID
 * @param {string} className - Class name
 * @returns {Promise<Object>} - Result with extracted name and verification info
 */
async function processImageForStudentNameAndVerify(filePath, outputBasePath, userId, className) {
  let extractedText = "";
  let extractedName = "";
  let croppedImagePath = "";

  // Fix Windows paths - WSL needs Unix-style paths
  filePath = filePath.replace(/\\/g, "/");
  outputBasePath = outputBasePath.replace(/\\/g, "/");

  // Create directory if it doesn't exist
  const croppedDir = path.join(outputBasePath, "cropped");
  await fs.ensureDir(croppedDir);

  // Generate output path for cropped image
  const fileName = path.basename(filePath);
  croppedImagePath = path.join(croppedDir, `cropped_${fileName}`);

  // Fix any Windows-style paths in the output path
  croppedImagePath = croppedImagePath.replace(/\\/g, "/");

  // Check file type to handle different formats
  const fileExt = path.extname(filePath).toLowerCase();
  const isPdf = fileExt === ".pdf" || (await isPdfFile(filePath));

  // For PDFs, we MUST convert to image first for proper processing
  if (isPdf) {
    // Last resort: Use utils/encodeToBase64 which is used in the main app
    try {
      logger.info("Trying fallback with encodeToBase64 utility...");
      const fileBuffer = await fs.readFile(filePath);

      const base64Images = await convertPdfToBase64Images(fileBuffer, "fallback");

      if (!base64Images || base64Images.length === 0) {
        return;
      }
      // Write the base64 image to file
      const imageBuffer = Buffer.from(base64Images[0], "base64");
      const tempImagePath = path.join(croppedDir, "fallback_converted.png").replace(/\\/g, "/");

      await fs.writeFile(tempImagePath, imageBuffer);
      logger.info(`Successfully created image from PDF at ${tempImagePath}`);

      // Now crop the image
      try {
        const metadata = await sharp(tempImagePath).metadata();
        const { width, height } = metadata;

        // Calculate the top 20% of the image
        const cropHeight = Math.floor(height * 0.2);

        // Crop the image
        await sharp(tempImagePath)
          .extract({ left: 0, top: 0, width, height: cropHeight })
          .toFile(croppedImagePath);
      } catch (cropError) {
        logger.warn(`Error cropping final fallback image: ${cropError.message}`);
        // If cropping fails, use the full converted image
        croppedImagePath = tempImagePath;
      }
      // Clean up original converted image
      fs.removeSync(tempImagePath);
    } catch (finalError) {
      logger.error(`All conversion methods failed: ${finalError.message}`);
    }
  } else {
    // For regular images, use the normal process
    try {
      croppedImagePath = await cropTopOfImage(filePath, croppedImagePath);
    } catch (cropError) {
      logger.warn(`Image cropping failed: ${cropError.message}`);
      // If cropping fails, try to continue with original file
      croppedImagePath = filePath;
    }
  }

  // Use Google Vision API for text extraction (like in the main process)
  try {
    // Always use textDetection which is more reliable for images
    const [result] = await googleVisionClient.textDetection(croppedImagePath);

    if (result && result.textAnnotations && result.textAnnotations.length > 0) {
      extractedText = result.textAnnotations[0].description;
      logger.info(`Text extraction successful, found ${extractedText.length} characters`);
    } else {
      logger.warn("No text detected in image, trying document text detection as fallback");

      // Fallback to document text detection
      const [docResult] = await googleVisionClient.documentTextDetection(croppedImagePath);
      if (docResult && docResult.fullTextAnnotation) {
        extractedText = docResult.fullTextAnnotation.text || "";
        logger.info(
          `Fallback text extraction successful, found ${extractedText.length} characters`
        );
      } else {
        logger.warn("No text detected using either method");
        extractedText = "";
      }
    }
  } catch (textError) {
    logger.warn(`Text extraction failed: ${textError.message}`);
    extractedText = "";
  }

  if (extractedText && extractedText.trim().length > 0) {
    try {
      // Extract student name using AI
      extractedName = await extractStudentNameFromText(extractedText);
      logger.info(`Extracted student name: "${extractedName}"`);
    } catch (nameError) {
      logger.warn(`Name extraction failed: ${nameError.message}`);
      // Continue with empty name
      extractedName = "";
    }
  } else {
    logger.info("No text extracted, skipping name extraction");
  }

  try {
    // Verify student name against database
    const verification = await verifyStudentNameInDatabase(extractedName, userId, className);

    // Check if requiresTeacherReview is provided in the verification result
    // If not, set it based on our own logic
    if (verification.requiresTeacherReview === undefined) {
      verification.requiresTeacherReview = !verification.exactMatch && extractedName;
    }

    return {
      extractedText: extractedText ? extractedText.substring(0, 200) + "..." : "",
      extractedName,
      verificationResult: verification,
      studentName: verification.finalName, // This will be the verified name or "No Name"
      croppedImagePath,
      requiresTeacherReview: verification.requiresTeacherReview, // Use the flag from verification
    };
  } catch (error) {
    logger.error("Error processing file for student name verification:", error);

    // Even in case of overall failure, return a valid object with default values
    // to prevent the entire document upload from failing
    return {
      extractedText: "",
      extractedName: "",
      verificationResult: {
        verified: false,
        exactMatch: false,
        similarMatches: [],
        finalName: "No Name",
        error: error.message,
      },
      studentName: "No Name",
      croppedImagePath,
      requiresTeacherReview: true,
      error: error.message,
    };
  }
}

/**
 * Helper function to check if a file is a PDF by looking at its content
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} - Whether the file is a PDF
 */
async function isPdfFile(filePath) {
  try {
    // Normalize path for WSL
    filePath = filePath.replace(/\\/g, "/");

    // Check if file exists first
    if (!fs.existsSync(filePath)) {
      logger.error(`File does not exist for PDF check: ${filePath}`);
      return false;
    }

    const fileBuffer = await fs.readFile(filePath, { encoding: null });

    // Check for PDF header signature (%PDF-)
    const isPdf = fileBuffer.length > 4 && fileBuffer.toString("ascii", 0, 5) === "%PDF-";

    if (isPdf) {
      logger.info(`PDF signature detected for file: ${filePath}`);
    } else {
      logger.info(`File is not a PDF: ${filePath}`);
    }

    return isPdf;
  } catch (error) {
    logger.error(`Error checking if file is PDF (${filePath}): ${error.message}`);
    logger.error(error.stack);
    return false;
  }
}

module.exports = {
  processImageForStudentNameAndVerify,
};
