const fs = require("fs-extra");
const path = require("path");
const sharp = require("sharp");
const vision = require("@google-cloud/vision");
const { verifyStudentName } = require("./StudentService");
const { convertPdfToBase64Images } = require("../utils/encodeToBase64");

const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: path.join(__dirname, "..", "google_vision.json"),
});

const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Crop the top 20% of an image file (if image; otherwise, handle PDF by copying).
 * @param {string} inputPath - File to process.
 * @param {string} outputPath - Path to save cropped image or copy.
 * @returns {Promise<string>} - Path to cropped or copied file.
 */
async function cropTopOfImage(inputPath, outputPath) {
  inputPath = inputPath.replace(/\\/g, "/");
  outputPath = outputPath.replace(/\\/g, "/");

  if (!fs.existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`);
  }

  const ext = path.extname(inputPath).toLowerCase();

  // Detect PDF by content
  const buffer = await fs.readFile(inputPath);
  const isPdf = ext === ".pdf" || buffer.slice(0, 5).toString("ascii") === "%PDF-";

  if (isPdf) {
    // For PDFs, just copy the file
    let targetPath = outputPath;
    if (isPdf && !ext.endsWith(".pdf")) {
      targetPath += ".pdf";
    }
    await fs.copyFile(inputPath, targetPath);
    return targetPath;
  }

  // For images, crop top 20%
  let metadata;
  try {
    metadata = await sharp(inputPath).metadata();
  } catch {
    // If metadata fails, fallback to copying original file
    await fs.copyFile(inputPath, outputPath);
    return outputPath;
  }

  const cropHeight = Math.floor(metadata.height * 0.2);

  try {
    await sharp(inputPath)
      .extract({ left: 0, top: 0, width: metadata.width, height: cropHeight })
      .toFile(outputPath);
    return outputPath;
  } catch {
    await fs.copyFile(inputPath, outputPath);
    return outputPath;
  }
}

/**
 * Use OpenAI to extract a full student name from OCR text.
 * @param {string} text - OCR extracted text.
 * @returns {Promise<string>} - Extracted full name or empty string if none found.
 */
async function extractStudentNameFromText(text) {
  const prompt = `Extract the complete student name from this text. Return only the full name or "NO_NAME_FOUND" if none.

Text:
${text}

Complete student name only:`;

  const response = await openai.chat.completions.create({
    model: "chatgpt-4o-latest",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 50,
  });

  const name = response.choices[0].message.content.trim();
  return name === "NO_NAME_FOUND" ? "" : name;
}

/**
 * Check if a given name exists or matches closely in the student database.
 * @param {string} name - Student name to verify.
 * @param {string} userId - User identifier.
 * @param {string} className - Class identifier.
 * @returns {Promise<Object>} - Verification result including matches and flags.
 */
async function verifyNameInDB(name, userId, className) {
  if (!name || !className) {
    return {
      verified: false,
      exactMatch: false,
      similarMatches: [],
      finalName: "No Name",
      requiresTeacherReview: false,
    };
  }

  try {
    const result = await verifyStudentName(userId, name, className);

    let finalName = "No Name";
    let requiresReview = true;

    if (result.exactMatch) {
      finalName = result.student.studentName;
      requiresReview = false;
    } else if (result.similarMatches?.length) {
      finalName = result.similarMatches[0].studentName;
    } else if (name.trim()) {
      finalName = "No Name Found In Database";
    }

    return {
      verified: result.exactMatch,
      exactMatch: result.exactMatch,
      similarMatches: result.similarMatches || [],
      finalName,
      requiresTeacherReview: requiresReview,
      extractedName: name,
      message: result.message,
    };
  } catch (err) {
    return {
      verified: false,
      exactMatch: false,
      similarMatches: [],
      finalName: "No Name",
      requiresTeacherReview: true,
      extractedName: name,
      error: err.message,
    };
  }
}

/**
 * Main function: process a file to extract student name and verify.
 * @param {string} filePath - Path to PDF/image.
 * @param {string} baseOutputPath - Folder for temp files.
 * @param {string} userId - User ID.
 * @param {string} className - Class name.
 * @returns {Promise<Object>} - Result object with extracted name and verification info.
 */
async function processFileForNameVerification(filePath, baseOutputPath, userId, className) {
  filePath = filePath.replace(/\\/g, "/");
  baseOutputPath = baseOutputPath.replace(/\\/g, "/");

  const croppedDir = path.join(baseOutputPath, "cropped");
  await fs.ensureDir(croppedDir);

  const fileName = path.basename(filePath);
  let croppedPath = path.join(croppedDir, `cropped_${fileName}`).replace(/\\/g, "/");

  const ext = path.extname(filePath).toLowerCase();
  const buffer = await fs.readFile(filePath);
  const isPdf = ext === ".pdf" || buffer.slice(0, 5).toString("ascii") === "%PDF-";

  if (isPdf) {
    try {
      const base64Imgs = await convertPdfToBase64Images(buffer, "fallback");
      if (!base64Imgs || base64Imgs.length === 0) {
        return {};
      }
      const imageBuffer = Buffer.from(base64Imgs[0], "base64");
      const tempImgPath = path.join(croppedDir, "converted.png").replace(/\\/g, "/");
      await fs.writeFile(tempImgPath, imageBuffer);

      try {
        const meta = await sharp(tempImgPath).metadata();
        const cropHeight = Math.floor(meta.height * 0.2);
        await sharp(tempImgPath)
          .extract({ left: 0, top: 0, width: meta.width, height: cropHeight })
          .toFile(croppedPath);
        await fs.remove(tempImgPath);
      } catch {
        croppedPath = tempImgPath;
      }
    } catch {
      // fallback failure - continue
    }
  } else {
    try {
      croppedPath = await cropTopOfImage(filePath, croppedPath);
    } catch {
      croppedPath = filePath;
    }
  }

  let extractedText = "";
  try {
    const [textResult] = await visionClient.textDetection(croppedPath);
    if (textResult?.textAnnotations?.length) {
      extractedText = textResult.textAnnotations[0].description || "";
    } else {
      const [docResult] = await visionClient.documentTextDetection(croppedPath);
      extractedText = docResult?.fullTextAnnotation?.text || "";
    }
  } catch {
    extractedText = "";
  }

  let extractedName = "";
  if (extractedText.trim()) {
    try {
      extractedName = await extractStudentNameFromText(extractedText);
    } catch {
      extractedName = "";
    }
  }

  const verification = await verifyNameInDB(extractedName, userId, className);

  return {
    extractedText: extractedText ? extractedText.slice(0, 200) + "..." : "",
    extractedName,
    verificationResult: verification,
    studentName: verification.finalName,
    croppedImagePath: croppedPath,
    requiresTeacherReview: verification.requiresTeacherReview,
  };
}

module.exports = {
  processFileForNameVerification,
};
