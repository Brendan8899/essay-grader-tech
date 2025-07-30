const { InputPdf } = require("../mongoDB_schema");
const { processOutput, addErrors: openAIAddErrors } = require("./OpenAI");
const { processImageForStudentNameAndVerify } = require("./NameExtractor");
const logger = require("../utils/logger.js")("DocumentService");
const { sendByUserId } = require("../websocket.js");

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchConditionConstructor(userId, filter = {}) {
  const searchConditions = { userId: userId };
  const escapedSearch = escapeRegExp(filter.search);

  if (escapedSearch) {
    let classRegex = new RegExp("No Class", "i");
    let studentRegex = new RegExp("No Name", "i");
    let essayRegex = new RegExp("No Essay Name", "i");
    if (classRegex.test(escapedSearch)) {
      searchConditions.className = "";
    } else if (studentRegex.test(escapedSearch)) {
      searchConditions.studentName = "";
    } else if (essayRegex.test(escapedSearch)) {
      searchConditions.essayName = "";
    } else {
      const regex = new RegExp(escapedSearch);
      searchConditions.$or = [
        { essayName: { $regex: regex, $options: "i" } },
        { studentName: { $regex: regex, $options: "i" } },
        { className: { $regex: regex, $options: "i" } },
      ];
    }
  }

  if (filter.startDate && filter.endDate) {
    const startDate = new Date(filter.startDate);
    const endDate = new Date(filter.endDate);
    endDate.setHours(23, 59, 59, 999);

    searchConditions.createdAt = {
      $gte: startDate,
      $lte: endDate,
    };
  } else if (filter.startDate) {
    searchConditions.createdAt = { $gte: new Date(filter.startDate) };
  } else if (filter.endDate) {
    const endDate = new Date(filter.endDate);
    endDate.setHours(23, 59, 59, 999);

    searchConditions.createdAt = { $lte: endDate };
  }
  return searchConditions;
}

async function createDocument(data, filename) {
  const {
    userId,
    name,
    className,
    assignmentName,
    pointSystem,
    grade,
    essayType,
    awardPoints,
    customInstructions,
  } = data;

  const awardPointsArr = awardPoints?.split(",");

  let studentName = filename.split(".")[0];

  const inputPdf = new InputPdf({
    className,
    studentName: name || studentName, // Update once graded
    essayName: assignmentName,
    pointSystem,
    grade,
    essayType,
    awardPoints: awardPointsArr,
    customInstructions,
    filename: "", // Update once graded
    userId: userId,
    labelledDocumentPath: "", // Update once graded
    processedOutputAI: [], // Update once graded
    processState: "processing", // Update once graded
    createdAt: new Date(),
    canvasSave: false,
  });

  const newInputPDF = await inputPdf.save();

  return newInputPDF;
}

async function updateAIResponseToDocument(inputPdf, data, file, errors, boundary) {
  let processedOutput = [];
  if (data !== "") {
    processedOutput = openAIAddErrors(processOutput(data), errors);
  }

  const studentName = file?.name?.split(".")[0] || ""; // Extract student name from file name

  // Organize errors by type for better organization and retrieval
  const organizedAnnotations = {
    spelling_and_handwriting: [],
    grammar: [],
    punctuation: [],
    syntax: [],
    improvement: [],
  };

  if (Array.isArray(errors)) {
    errors.forEach((error, index) => {
      const annotation = normalizeError(error, index);
      const group = getAnnotationGroup(annotation.error_type);
      if (group && organizedAnnotations[group]) {
        organizedAnnotations[group].push(annotation);
      }
    });
  }

  await InputPdf.findByIdAndUpdate(
    inputPdf._id,
    {
      name: studentName,
      filename: file.originalname,
      labelledDocumentPath: file.finalPdfPath,
      svgDocumentPath: file.finalPdfPath,
      originalPdfPath: file.originalPdfPath,
      imagesPath: file.folderName,
      rawImgPath: file.rawImgPath,
      annotations: organizedAnnotations, // Store organized annotation data for SVG generation
      processedOutputAI: processedOutput,
      gptLog: data,
      processState: data === "" ? "failed" : "processed",
      boundary: boundary || [20, 1320], // default boundary according to default image size
    },
    { new: true }
  );
}

function normalizeError(error, index) {
  const annotation = {
    ...error,
    index: error.index ?? index,
    page: error.page ?? 0,
    feedback: error.feedback ?? "",
    lines: error.lines ?? [],
    words: error.words ?? [],
    uniqueId: `${error.error_type}_${index}_${Date.now()}`,
  };

  const type = error.error_type;
  const ACCEPTED_TYPES = [
    "grammar",
    "punctuation",
    "syntax",
    "improvement",
    "spelling",
    "unclear_handwriting",
  ];
  if (ACCEPTED_TYPES.includes(type)) {
    annotation.firstWordCoordinates = error.firstWordCoordinates;
    annotation.lastWordCoordinates = error.lastWordCoordinates;
    annotation.isSameLine = error.lines.length <= 1;
  }

  return annotation;
}

function getAnnotationGroup(type) {
  if (type === "spelling" || type === "unclear_handwriting") return "spelling_and_handwriting";
  if (["grammar", "punctuation", "syntax", "improvement"].includes(type)) return type;
  return null;
}

async function updateDuplicatedDocument(inputPdf, existingPdf) {
  const clonedExistingPdf = Object.assign({}, existingPdf);
  delete clonedExistingPdf._id;
  return InputPdf.findByIdAndUpdate(
    inputPdf._id,
    {
      ...clonedExistingPdf,
      filename: inputPdf.originalname,
      essayName: inputPdf.essayName,
      className: inputPdf.className,
      createdAt: inputPdf.createdAt,
    },
    { new: true }
  );
}

/**
 * Create a document with student name verification
 * @param {String} userId - User id
 * @param {Object} data - Document metadata
 * @param {string} filename - Original filename
 * @param {string} imagePath - Path to the first page image
 * @param {string} outputBasePath - Base output path
 * @returns {Promise<Object>} - Created document and name verification result
 */
async function createDocumentWithVerification(userId, data, filename, filePath, outputBasePath) {
  const {
    className,
    assignmentName,
    pointSystem,
    grade,
    essayType,
    awardPoints,
    customInstructions,
  } = data;

  const awardPointsArr = awardPoints?.split(",");

  // Create the document with "EXTRACTING NAME" placeholder
  const inputPdf = new InputPdf({
    className,
    studentName: "EXTRACTING NAME", // Initial placeholder
    essayName: assignmentName,
    pointSystem,
    grade,
    essayType,
    awardPoints: awardPointsArr,
    customInstructions,
    filename: filename,
    userId: userId,
    labelledDocumentPath: "", // Update once graded
    processedOutputAI: [], // Update once graded
    processState: "processing", // Update once graded
    createdAt: new Date(),
    canvasSave: false,
    nameExtractionStatus: "pending", // Add new field to track name extraction specifically
  });

  const newInputPDF = await inputPdf.save();

  await sendByUserId(userId, "Document-Creation", {
    newInputPdfid: newInputPDF._id,
    data,
  });

  // Process image to extract and verify student name in the background
  const nameResult = await processImageForStudentNameAndVerify(
    filePath,
    outputBasePath,
    userId,
    className
  );

  try {
    // Update the document with the extracted name
    await InputPdf.findByIdAndUpdate(newInputPDF._id, {
      studentName: nameResult.studentName, // Will be verified name or "No Name"
      extractedStudentName: nameResult.extractedName, // Store the original extracted name
      nameVerified: nameResult.verificationResult.exactMatch, // Was an exact match found?
      requiresTeacherReview: nameResult.requiresTeacherReview, // Flag for teacher review
      nameExtractionStatus: "completed", // Update status
    });
  } catch (err) {
    logger.error("Error updating document with extracted name:", err);
    InputPdf.findByIdAndUpdate(newInputPDF._id, {
      studentName: "No Name Found",
      nameExtractionStatus: "failed",
    }).catch((updateErr) => logger.error(updateErr));
  }

  await sendByUserId(userId, "Name-Extraction", {
    newInputPdfid: newInputPDF._id,
    nameResult,
  });

  return {
    document: newInputPDF,
    newInputPDFid: newInputPDF._id,
    nameResult,
  };
}

// Add function to update student name after teacher review
async function updateStudentNameAfterReview(documentId, studentName, userId) {
  try {
    // Ensure the document belongs to this teacher
    const document = await InputPdf.findOne({
      _id: documentId,
      userId,
    });

    if (!document) {
      return {
        success: false,
        message: "Document not found or you don't have permission to update it",
      };
    }

    // Check if student exists in the database for this class
    const { Student } = require("../mongoDB_schema");
    const existingStudent = await Student.findOne({
      userId,
      className: document.className,
      studentName: { $regex: new RegExp(`^${studentName}$`, "i") },
    });

    // If student doesn't exist, add them to the database
    if (
      !existingStudent &&
      studentName.trim() !== "No Name" &&
      studentName.trim() !== "No Name Found In Database"
    ) {
      try {
        await Student.create({
          userId,
          className: document.className,
          studentName: studentName.trim(),
        });
        logger.info(`Added new student "${studentName}" to class "${document.className}"`);
      } catch (addError) {
        logger.error("Error adding student to database:", addError);
        // Continue with document update even if student addition fails
      }
    }

    // Update the document with the verified name
    const updatedDoc = await InputPdf.findByIdAndUpdate(
      documentId,
      {
        studentName,
        nameVerified: true,
        requiresTeacherReview: false,
      },
      { new: true }
    );

    return {
      success: true,
      message: "Student name updated successfully",
      document: updatedDoc,
    };
  } catch (error) {
    logger.error("Error updating student name:", error);
    throw error;
  }
}

async function updateAnnotations(documentId, type, index, updatedFeedback) {
  const document = await InputPdf.findOne({
    _id: documentId,
  });

  const updatedAnnotations = document.annotations[type].map((documentError) => {
    if (documentError.index == index) {
      documentError.feedback = updatedFeedback;
    }
    return documentError;
  });

  await InputPdf.findByIdAndUpdate(documentId, {
    annotations: { [type]: updatedAnnotations, ...document.annotations },
  });
}

module.exports = {
  searchConditionConstructor,
  createDocument,
  updateAIResponseToDocument,
  updateDuplicatedDocument,
  createDocumentWithVerification,
  updateStudentNameAfterReview,
  updateAnnotations,
};
