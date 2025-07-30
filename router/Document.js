const express = require("express");
const logger = require("../utils/logger.js")("DocumentRouter");
const { InputPdf, feedbackPreferences, InputPdfCanvas } = require("../mongoDB_schema");
const path = require("path");
const { Storage } = require("@google-cloud/storage");
const {
  searchConditionConstructor,
  updateStudentNameAfterReview,
  updateAnnotations,
} = require("../services/Document.service");
const { classifyStrengthAndWeakness } = require("../services/OpenAI");
const multer = require("multer");
const { deleteFilePath } = require("../utils/utils");
const Queue = require("bull");
const { ObjectId } = require("mongodb");
const redisConfig = require("../config").REDIS;
const {
  appendFeedback,
  massAppendFeedback,
} = require("../services/AppendFeedback/appendFeedback.service.js");

const documentRouter = express.Router();

const upload = multer({
  dest: "C:/tmp/",
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

// Initialize Google Cloud Storage
const storage = new Storage({
  keyFilename: "lenor-ai-google-storage.json",
});

const bucketName = "lenor-bucket";
const bucket = storage.bucket(bucketName);

documentRouter.post("/list", async (req, res) => {
  const { page, filter = {}, rowsPerPage = 10 } = req.body;

  let searchConditions = searchConditionConstructor(req.user.uid, filter);

  const documents = await InputPdf.find(searchConditions, {
    _id: 1,
    processState: 1,
    className: 1,
    essayName: 1,
    studentName: 1,
    extractedName: 1,
    createdAt: 1,
  })
    .sort({ _id: -1 })
    .skip((page - 1) * rowsPerPage)
    .limit(rowsPerPage)
    .exec();

  const count = await InputPdf.find(searchConditions).countDocuments();
  const totalPages = Math.ceil(count / rowsPerPage);
  return res.status(200).json({
    meta: {
      totalPages,
      count,
    },
    data: documents,
  });
});

/**
 * Get all document IDs for the current user with optional filtering
 * This is used for sequential navigation between documents across pages
 */
documentRouter.post("/allIds", async (req, res) => {
  const { filter = {} } = req.body || {};

  let searchConditions = searchConditionConstructor(req.user.uid, filter);

  // Only select the _id field
  const documentIds = await InputPdf.find(searchConditions)
    .sort({ createdAt: -1 })
    .select("_id")
    .lean()
    .exec();

  // Extract just the IDs as an array
  const idArray = documentIds.map((doc) => doc._id.toString());

  return res.status(200).json({ msg: "ok", body: idArray });
});

documentRouter.post("/appendFeedbackPreferences", async (req, res) => {
  const { feedbackChoices } = req.body;
  const userId = req.user.uid;
  const userPreference = await feedbackPreferences.findOne({ userId });
  if (userPreference) {
    await feedbackPreferences.findOneAndUpdate({ userId }, feedbackChoices);
  } else {
    await feedbackPreferences.create({ ...feedbackChoices, userId });
  }
  return res.status(204).send();
});

/** d
 * Get overall strength and weakness by class and assignment (assignment is mandatory field).
 * If strength and weakness not set, calls OpenAI to set it.
 */
documentRouter.post("/overall-strengths", async (req, res) => {
  const uid = req.user.uid;
  const className = req.query.className;
  const assignmentName = req.query.assignmentName;

  if (className && !assignmentName) {
    return res.status(400).json({ msg: "Missing assignment name." });
  }

  if (!className && !assignmentName) {
    return res.status(400).json({ msg: "Missing class and assignment name." });
  }

  const filteredData = [];

  logger.info(
    `Searching for documents with class=${className}, assignment=${assignmentName}, userId=${uid}`
  );
  const data = await InputPdf.find({
    essayName: assignmentName,
    userId: uid,
    ...(className && { className }),
  });

  logger.info(`Found ${data.length} matching documents`);

  // Count how many documents are still processing
  const processingCount = data.filter((doc) => doc.processState === "processing").length;

  // Process documents - should be much faster now as most will already have analysis
  let pendingAnalysis = 0;

  for (const essay of data) {
    // Check if the document needs analysis (legacy support)
    if (
      essay.strengthsAndWeaknesses.strongAreas.length === 0 &&
      essay.strengthsAndWeaknesses.weakAreas.length === 0 &&
      essay.strengthsAndWeaknesses.mostCommonMistakes.length === 0
    ) {
      pendingAnalysis++;
      logger.info(`Processing strengths/weaknesses for legacy document: ${essay._id}`);
      try {
        const newStrAndWk = await classifyStrengthAndWeakness(
          JSON.stringify({ processedOutputAI: essay.processedOutputAI })
        );
        const updatedEssay = await InputPdf.findByIdAndUpdate(
          essay._id,
          { strengthsAndWeaknesses: JSON.parse(newStrAndWk) },
          { new: true }
        );
        essay.strengthsAndWeaknesses = updatedEssay.strengthsAndWeaknesses;
      } catch (error) {
        logger.error(error);
      }
    }

    const filteredFields = {
      pointSystem: essay.pointSystem,
      essayType: essay.essayType,
      scores: essay.processedOutputAI.slice(0, 3),
      className: essay.className,
      essayName: essay.essayName,
      studentName: essay.studentName,
      strengthsAndWeaknesses: essay.strengthsAndWeaknesses,
      processState: essay.processState, // Include process state for frontend use
    };
    filteredData.push(filteredFields);
  }

  if (pendingAnalysis > 0) {
    logger.info(`Analyzed ${pendingAnalysis} legacy documents on-demand`);
  }

  // Create processing status object
  const processingStatus = {
    isProcessing: processingCount > 0,
    processingCount: processingCount,
    totalCount: data.length,
    completionPercentage:
      data.length > 0 ? Math.round(((data.length - processingCount) / data.length) * 100) : 100,
  };

  logger.info(
    `Returning ${filteredData.length} processed documents. Processing status: ${processingStatus}`
  );
  return res.status(200).json({
    msg: "Found documents with strengths and weaknesses.",
    data: filteredData,
    processingStatus: processingStatus,
  });
});

documentRouter.get("/appendFeedbackPreferences", async (req, res) => {
  const userPreference = await feedbackPreferences.findOne({ userId: req.user.uid });
  if (!userPreference) {
    const { _id, ...data } = await feedbackPreferences.create({ userId: req.user.uid });
    return res.status(200).send(data);
  }
  const { _id, ...data } = userPreference.toObject();
  return res.status(200).send(data);
});

documentRouter.post("/appendFeedback", async (req, res) => {
  const { documentId, options, includeError } = req.body;
  const resultPdfBuffer = await appendFeedback(documentId, options, includeError);
  logger.info(`PDF bytes generated successfully for document ${documentId}`);

  res.type("application/pdf");
  res.send(resultPdfBuffer);
});

documentRouter.post("/massAppendFeedback", async (req, res) => {
  const { documentIds, options } = req.body;

  logger.info(`Appending feedback to ${documentIds.length} documents`);
  res.type("application/zip");
  // pass in Response object for archiver to pipe into
  await massAppendFeedback(documentIds, options, res);
});

documentRouter.post("/graded/:id", upload.single("file"), async (req, res) => {
  const item = await InputPdf.findById(req.params.id);
  const file = req.file;

  if (!file) {
    return res.status(400).send("No file uploaded.");
  }

  if (!item) return res.status(404).json({ message: "Document is not found" });

  const labelledDocumentArr = item.labelledDocumentPath.split("/");
  labelledDocumentArr.pop();

  const finalPdfDestinaton =
    labelledDocumentArr.join("/") + "/" + `updated_document_${new Date().toISOString()}.pdf`;

  // Uploading documents
  await bucket.upload(file.path, {
    destination: path.join(process.env.GOOGLE_STORAGE_BUCKET_UPLOADED_FOLER, finalPdfDestinaton),
  });

  const updatedInputPDf = await InputPdf.findByIdAndUpdate(
    item._id,
    {
      labelledDocumentPath: finalPdfDestinaton,
    },
    {
      new: true,
    }
  );

  // Delete Local folder in background
  deleteFilePath(file.path);

  // Construct file URLs for response
  const uploadedHost = `${process.env.GOOGLE_STORAGE_BUCKET}/${process.env.GOOGLE_STORAGE_BUCKET_UPLOADED_FOLER}`;
  const fileUrl = uploadedHost + "/" + updatedInputPDf?.labelledDocumentPath;
  const svgFileUrl = uploadedHost + "/" + updatedInputPDf?.svgDocumentPath;

  const pathArr = updatedInputPDf.labelledDocumentPath.split("/");
  pathArr.pop();
  const originalFileUrl = uploadedHost + "/" + pathArr.join("/") + "/final_document.pdf";

  const result = { ...item, _doc: { ...item._doc, fileUrl, svgFileUrl, originalFileUrl } };

  return res.status(200).json(result._doc);
});

documentRouter.post("/restore/:id", upload.single("file"), async (req, res) => {
  const item = await InputPdf.findById(req.params.id);

  if (!item) return res.status(404).json({ message: "Document is not found" });

  const labelledDocumentArr = item.labelledDocumentPath.split("/");
  labelledDocumentArr.pop();

  const finalPdfDestination = labelledDocumentArr.join("/") + "/" + `final_document.pdf`;

  // Prepare the update object for annotations
  const updateObj = {
    userAnnotations: [],
    labelledDocumentPath: finalPdfDestination,
    svgDocumentPath: finalPdfDestination,
    canvasSave: false,
  };

  // Clear the 'deleted' flag from all annotations if they exist
  if (item.annotations) {
    // Clone the annotations to avoid modifying the original object
    const updatedAnnotations = JSON.parse(JSON.stringify(item.annotations));

    // Loop through each annotation type
    Object.keys(updatedAnnotations).forEach((annotationType) => {
      if (Array.isArray(updatedAnnotations[annotationType])) {
        // Loop through each annotation and remove the deleted field
        updatedAnnotations[annotationType].forEach((annotation) => {
          delete annotation?.deleted;
        });
      }
    });

    // Add the updated annotations to our update object
    updateObj.annotations = updatedAnnotations;
  }

  const updatedInputPDf = await InputPdf.findByIdAndUpdate(item._id, updateObj, {
    new: true,
  });

  const inputPdfCanvas = await InputPdfCanvas.findOne({ inputPdfID: req.params.id });
  await InputPdfCanvas.findOneAndUpdate(inputPdfCanvas._id, { canvasString: "" }, { new: true });

  const uploadedHost = `${process.env.GOOGLE_STORAGE_BUCKET}/${process.env.GOOGLE_STORAGE_BUCKET_UPLOADED_FOLER}`;
  const fileUrl = uploadedHost + "/" + updatedInputPDf?.labelledDocumentPath;
  const svgFileUrl = uploadedHost + "/" + updatedInputPDf?.svgDocumentPath;

  const restoredDocPathArr = updatedInputPDf.labelledDocumentPath.split("/");
  restoredDocPathArr.pop();
  const originalFileUrl = uploadedHost + "/" + restoredDocPathArr.join("/") + "/final_document.pdf";

  const result = { ...item, _doc: { ...item._doc, fileUrl, svgFileUrl, originalFileUrl } };

  return res.status(200).json(result._doc);
});

documentRouter.delete("/:id", async (req, res) => {
  const deletedItem = await InputPdf.findByIdAndDelete(req.params.id);
  await InputPdfCanvas.findOneAndDelete({ inputPdfID: req.params.id });

  if (!deletedItem) return res.status(404).json({ message: "Item not found" });
  return res.status(200).json({ message: "Item deleted" });
});

// Add new cancel endpoint
documentRouter.post("/cancel/:id", async (req, res) => {
  // Find document
  const document = await InputPdf.findOne({ _id: req.params.id, userId: req.user.uid });
  if (!document) {
    return res.status(404).json({ message: "Document not found" });
  }

  let message = "";
  let wasInQueue = false;

  // Only try to cancel if document is in processing state
  if (document.processState === "processing") {
    try {
      const myQueue = new Queue("myQueue", {
        redis: redisConfig,
      });

      // Look for job using document ID
      const job = await myQueue.getJob(document._id.toString());

      if (job) {
        // Check job state
        const isWaiting = await job.isWaiting();
        const isActive = await job.isActive();

        if (isWaiting) {
          // Remove job if it's still waiting
          await job.remove();
          message = "Document removed from processing queue";
          wasInQueue = true;
        } else if (isActive) {
          message = "Document is already being processed, will be deleted";
        } else {
          message = "Document job found but is in an unexpected state";
        }
      } else {
        message = "Document is marked as processing but no job found in queue";
      }
    } catch (error) {
      logger.error(error);
      message = "Error accessing processing queue";
    }
  } else {
    message = `Document is in ${document.processState} state, not processing`;
  }

  // Delete the document instead of updating it
  const deletedDoc = await InputPdf.findByIdAndDelete(req.params.id);

  // Also delete any related canvas data
  await InputPdfCanvas.findOneAndDelete({ inputPdfID: req.params.id });

  if (!deletedDoc) {
    return res.status(404).json({ message: "Failed to delete document" });
  }

  return res.status(200).json({
    message: message,
    wasInQueue: wasInQueue,
    document: deletedDoc,
  });
});

documentRouter.get("/files/:filename", (req, res, next) => {
  const filename = req.params.filename;
  const filePath = path.join("C:/tmp", filename);

  return res.sendFile(filePath, next);
});

documentRouter.patch("/update", async (req, res) => {
  const { documentId, contentScore, languageScore } = req.body;

  const document = await InputPdf.findById(documentId);
  if (!document) {
    return res.status(404).json({ msg: "Document not found" });
  }

  const processedOutputAI = document.processedOutputAI;

  // Function to update the score for a specific label
  const updateScore = (label, newScore) => {
    const entry = processedOutputAI.find((item) => item[0] === label);
    if (entry) {
      entry[1] = newScore; // Update the score in place
    } else {
      throw new Error(`Entry with label '${label}' not found`);
    }
  };

  // Update the scores
  updateScore("Content Score", contentScore);
  updateScore("Language Score", languageScore);
  updateScore("Total Score", contentScore + languageScore); // Recalculate total score

  // Save the updated document
  const updatedDocument = await InputPdf.findByIdAndUpdate(
    documentId,
    { processedOutputAI },
    { new: true }
  );

  return res.status(200).json({ msg: "Document updated successfully", body: updatedDocument });
});

documentRouter.post("/setFeedbackAsModel/:id", async (req, res) => {
  const { isModel } = req.body;
  const updatedDocument = await InputPdf.findByIdAndUpdate(req.params.id, { isModel });
  return res.status(200).json({ msg: "Successfully set feedback as model", body: updatedDocument });
});

/**
 * Get strength and weakness of a single student under teacher (class and student name fields mandatory),
 * sorted by when the assignment is added to the database (newest first).
 * If strength and weakness not set, calls OpenAI to set it.
 */
documentRouter.post("/student-strengths", async (req, res) => {
  const uid = req.user.uid;
  const className = req.query.className;
  const studentName = req.query.studentName;

  if (!className || !studentName) {
    return res.status(400).json({ msg: "Missing student or class information" });
  }

  const filteredData = [];

  const data = await InputPdf.find({
    className,
    studentName,
    userId: uid,
  }).sort({ createdAt: -1 }); // sort by when entry is created, newest to oldest

  logger.info(`Found ${data.length} documents for student ${studentName} in class ${className}`);

  // Count how many documents are still processing
  const processingCount = data.filter((doc) => doc.processState === "processing").length;

  let pendingAnalysis = 0;

  // Use for...of to properly handle async operations
  for (const essay of data) {
    if (
      essay.strengthsAndWeaknesses.strongAreas.length == 0 &&
      essay.strengthsAndWeaknesses.weakAreas.length == 0 &&
      essay.strengthsAndWeaknesses.mostCommonMistakes.length == 0
    ) {
      pendingAnalysis++;
      logger.info(`Processing strengths/weaknesses for legacy student document: ${essay._id}`);
      try {
        const newStrAndWk = await classifyStrengthAndWeakness(
          JSON.stringify({ processedOutputAI: essay.processedOutputAI })
        );
        const updatedEssay = await InputPdf.findByIdAndUpdate(
          essay._id,
          { strengthsAndWeaknesses: JSON.parse(newStrAndWk) },
          { new: true }
        );
        essay.strengthsAndWeaknesses = updatedEssay.strengthsAndWeaknesses;
      } catch (error) {
        logger.error(error);
      }
    }

    const filteredFields = {
      pointSystem: essay.pointSystem,
      essayType: essay.essayType,
      scores: essay.processedOutputAI.slice(0, 3), //total score, content score, language score
      className: essay.className,
      essayName: essay.essayName,
      studentName: essay.studentName,
      strengthsAndWeaknesses: essay.strengthsAndWeaknesses,
      processState: essay.processState, // Include process state for frontend use
    };
    filteredData.push(filteredFields);
  }

  if (pendingAnalysis > 0) {
    logger.info(`Analyzed ${pendingAnalysis} legacy student documents on-demand`);
  }

  // Create processing status object
  const processingStatus = {
    isProcessing: processingCount > 0,
    processingCount: processingCount,
    totalCount: data.length,
    completionPercentage:
      data.length > 0 ? Math.round(((data.length - processingCount) / data.length) * 100) : 100,
  };

  return res.status(200).json({
    msg: "Found student's documents.",
    data: filteredData,
    processingStatus: processingStatus,
  });
});

/**
 * Get all classes under a teacher.
 */
documentRouter.get("/class-list", async (req, res) => {
  const uid = req.user.uid;
  const docs = await InputPdf.find({ userId: uid });
  const classes = new Set(docs.map((doc) => doc.className));
  return res.json({ msg: "Found list of classes.", classes: Array.from(classes) });
});

/**
 * Get all assigment names under a teacher
 */
documentRouter.get("/assignment-list", async (req, res) => {
  const className = req.query.className;
  const docs = await InputPdf.find({
    userId: req.user.uid,
    ...(className && { className }),
  });
  const assignments = new Set(docs.map((doc) => doc.essayName));
  return res
    .status(200)
    .json({ msg: "Found list of classes.", assignments: Array.from(assignments) });
});

documentRouter.get("/:id", async (req, res) => {
  const item = await InputPdf.findOne({ _id: req.params.id, userId: req.user.uid });

  if (!item) return res.status(404).json({ message: "Document is not found" });

  const uploadedHost = `${process.env.GOOGLE_STORAGE_BUCKET}/${process.env.GOOGLE_STORAGE_BUCKET_UPLOADED_FOLER}`;
  const labelledDocumentPath = item.labelledDocumentPath;
  const svgDocumentPath = item.svgDocumentPath || item.labelledDocumentPath; // Fallback if svgDocumentPath is not available

  const labelledDocumentArr = item.labelledDocumentPath.split("/");
  labelledDocumentArr.pop();

  const fileUrl = uploadedHost + "/" + labelledDocumentPath;
  const svgFileUrl = uploadedHost + "/" + svgDocumentPath;
  const originalFileUrl =
    uploadedHost + "/" + labelledDocumentArr.join("/") + "/final_document.pdf";
  const rawImgUrl = uploadedHost + "/" + item.rawImgPath;
  const rawPdfUrl = uploadedHost + "/" + item.originalPdfPath;

  const result = { ...item._doc, fileUrl, svgFileUrl, originalFileUrl, rawImgUrl, rawPdfUrl };
  result.annotations = Object.entries(result.annotations)
    .map(([annotationGroup, annotations]) => ({
      [annotationGroup]: annotations.filter((annotation) => !annotation.deleted),
    }))
    .reduce((acc, obj) => ({ ...acc, ...obj }), {});

  const documentObjectId = new ObjectId(item._id);
  const prevEssay = await InputPdf.findOne(
    {
      _id: { $gt: documentObjectId },
      userId: req.user.uid,
      processState: "processed",
    },
    { projection: { _id: 1 } }
  )
    .sort({ _id: 1 })
    .limit(1)
    .exec();

  const nextEssay = await InputPdf.findOne(
    {
      _id: { $lt: documentObjectId },
      userId: req.user.uid,
      processState: "processed",
    },
    { projection: { _id: 1 } }
  )
    .sort({ _id: -1 })
    .limit(1)
    .exec();

  return res.status(200).json({
    meta: {
      nextEssayId: nextEssay?._id,
      prevEssayId: prevEssay?._id,
    },
    data: result,
  });
});

/**
 * Get all students from a certain class under a teacher (class field mandatory)
 * @deprecated Use /api/students/class/:userId?className=... endpoint instead
 */
documentRouter.get("/student-list/:uid", async (req, res) => {
  // Return a 410 Gone status with information about the new endpoint
  return res.status(410).json({
    msg: "This endpoint is deprecated and has been removed. Please use /api/students/class/:userId?className=... instead",
    redirectTo: `/api/students/class/${req.params.uid}?className=${encodeURIComponent(req.query.className || "")}`,
  });
});

/**
 * Update student name after teacher review
 */
documentRouter.post("/update-student-name/:id", async (req, res) => {
  const documentId = req.params.id;
  const { studentName } = req.body;

  if (!studentName) {
    return res.status(400).json({
      success: false,
      message: "Student name is required",
    });
  }

  const result = await updateStudentNameAfterReview(documentId, studentName, req.user.uid);

  if (!result.success) {
    return res.status(404).json(result);
  }

  return res.status(200).json(result);
});

documentRouter.put("/update-annotations/:id", async (req, res) => {
  const { id } = req.params;
  const { type, index, feedback } = req.body;

  await updateAnnotations(id, type, index, feedback);

  return res.status(200).json({
    success: true,
    message: `Annotations updated successfully!`,
  });
});

// Route to delete annotations by uniqueId
documentRouter.delete("/delete-annotations/:id", async (req, res) => {
  const { id } = req.params;
  const { annotationType, uniqueIds } = req.body;

  if (!annotationType || !Array.isArray(uniqueIds) || uniqueIds.length === 0) {
    return res.status(400).json({
      message: "Invalid request. Must provide annotationType and an array of uniqueIds",
    });
  }

  // Find the document first
  const document = await InputPdf.findById(id);
  if (!document) {
    return res.status(404).json({ message: "Document not found" });
  }

  // Check if the document has annotations
  if (!document.annotations || !document.annotations[annotationType]) {
    return res.status(404).json({ message: `No annotations of type ${annotationType} found` });
  }

  // Instead of filtering out annotations, mark them as deleted
  document.annotations[annotationType].forEach((annotation) => {
    if (uniqueIds.includes(annotation.uniqueId)) {
      annotation.deleted = true;
    }
  });

  // Update the document with the filtered annotations
  const updateQuery = {
    [`annotations.${annotationType}`]: document.annotations[annotationType],
  };

  const updatedDocument = await InputPdf.findByIdAndUpdate(id, updateQuery, { new: true });

  // Now we need to regenerate the SVG with the updated annotations
  // This would typically involve calling the same process that generates the SVG during initial processing
  // For now, we'll just return success and the updated document

  return res.status(200).json({
    message: `Successfully deleted ${uniqueIds.length} annotations`,
    document: updatedDocument,
  });
});

/**
 * Add a user annotation to a document
 */
documentRouter.post("/:id/userAnnotation", async (req, res) => {
  const documentId = req.params.id;
  const { errorType, index, feedback, page, firstWordCoordinates, lastWordCoordinates } = req.body;

  // Validate required fields
  if (!errorType || index === undefined || !feedback) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: errorType, index, and feedback are required",
    });
  }

  // Validate errorType is one of the allowed values
  const allowedErrorTypes = ["spelling_and_handwriting", "grammar", "punctuation", "improvement"];
  if (!allowedErrorTypes.includes(errorType)) {
    return res.status(400).json({
      success: false,
      message: `Invalid errorType. Must be one of: ${allowedErrorTypes.join(", ")}`,
    });
  }

  // Find the document
  const document = await InputPdf.findById(documentId);
  if (!document) {
    return res.status(404).json({ success: false, message: "Document not found" });
  }

  // Check if the index is already used in userAnnotations
  if (document.userAnnotations && document.userAnnotations.some((a) => a.index === index)) {
    return res.status(400).json({
      success: false,
      message: `Index ${index} is already in use in userAnnotations`,
    });
  }

  // Create the new annotation to add to db
  const newAnnotation = {
    errorType,
    index,
    feedback,
    page,
    firstWordCoordinates,
    lastWordCoordinates,
    createdAt: new Date(),
  };

  // Initialize userAnnotations array if it doesn't exist
  if (!document.userAnnotations) {
    document.userAnnotations = [];
  }

  // Add the annotation
  document.userAnnotations.push(newAnnotation);
  await document.save();

  return res.status(201).json({ success: true, annotation: newAnnotation });
});

/**
 * Delete a user annotation by index
 */
documentRouter.delete("/:id/userAnnotation/:index", async (req, res) => {
  const documentId = req.params.id;
  const index = parseInt(req.params.index);

  // Validate index
  if (isNaN(index)) {
    return res.status(400).json({ success: false, message: "Index must be a number" });
  }

  // Update document atomically - no version conflict
  const result = await InputPdf.findByIdAndUpdate(
    documentId,
    { $pull: { userAnnotations: { index: index } } },
    { new: true }
  );

  if (!result) {
    return res.status(404).json({ success: false, message: "Document not found" });
  }

  return res.status(200).json({
    success: true,
    message: `User annotation with index ${index} deleted successfully`,
  });
});

documentRouter.post("/:id", async (req, res) => {
  const item = await InputPdf.findById(req.params.id);
  if (!item) return res.status(404).json({ message: "Document is not found" });

  const updatedInputPDf = await InputPdf.findByIdAndUpdate(item._id, req.body, {
    new: true,
  });

  res.status(200).json(updatedInputPDf);
});

module.exports = documentRouter;
