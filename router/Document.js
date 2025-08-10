const express = require("express");
const { InputPdf, feedbackPreferences, InputPdfCanvas } = require("../mongoDB_schema");
const path = require("path");
const { Storage } = require("@google-cloud/storage");
const {
  searchConditionConstructor,
  updateStudentNameAfterReview,
  updateAnnotations,
} = require("../services/Document.service");
const multer = require("multer");
const { deleteFilePath } = require("../utils/utils");
const { ObjectId } = require("mongodb");

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

documentRouter.get("/appendFeedbackPreferences", async (req, res) => {
  const userPreference = await feedbackPreferences.findOne({ userId: req.user.uid });
  if (!userPreference) {
    const { _id, ...data } = await feedbackPreferences.create({ userId: req.user.uid });
    return res.status(200).send(data);
  }
  const { _id, ...data } = userPreference.toObject();
  return res.status(200).send(data);
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

documentRouter.delete("/:id", async (req, res) => {
  const deletedItem = await InputPdf.findByIdAndDelete(req.params.id);
  await InputPdfCanvas.findOneAndDelete({ inputPdfID: req.params.id });

  if (!deletedItem) return res.status(404).json({ message: "Item not found" });
  return res.status(200).json({ message: "Item deleted" });
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

documentRouter.post("/:id", async (req, res) => {
  const item = await InputPdf.findById(req.params.id);
  if (!item) return res.status(404).json({ message: "Document is not found" });

  const updatedInputPDf = await InputPdf.findByIdAndUpdate(item._id, req.body, {
    new: true,
  });

  res.status(200).json(updatedInputPDf);
});

module.exports = documentRouter;
