const express = require("express");
const multer = require("multer");
const { createDocument, createDocumentWithVerification } = require("../services/Document.service");
const { InputQuestionPdf } = require("../mongoDB_schema.js");
const { myQueue } = require("../services/QueueProvider.js");

const googleVisionRouter = express.Router();
const upload = multer({ dest: "C:/tmp/" });

/**
 * Expects a multipart/form-data request with:
 * - files: one or more files to upload (field name: "files")
 * - userId: testing or specific userId
 * - className (string): if present, triggers student name verification workflow
 * - assignmentName
 * - grade: (Which Level you are marking for: P5/P6)
 * - essayType: Narrative
 * - awardPoints: Creative
 * - customInstructions: null || String
 */

googleVisionRouter.post("/upload", upload.array("files"), async (req, res) => {
  const userId = req.user?.userId || 'testing';
  const jobs = [];

  const { className, questionId } = req.body;
  const questionChoice = questionId ? await InputQuestionPdf.findById(questionId) : null;

  const files = req.files;
  console.info("Iterating Through Files");
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let newInputPdf;

    // If className is provided, use student name verification
    if (className) {
      // Create a temporary path for processing
      const timestamp = new Date().getTime();
      const outputBasePath = `C:/tmp/name_extraction_${userId}_${timestamp}`;

      const result = await createDocumentWithVerification(
        userId,
        req.body,
        file.originalname,
        file.path,
        outputBasePath
      );

      newInputPdf = result.document;

      // Log verification result
      console.info(
        `Name extraction for ${file.originalname}: ${JSON.stringify({
          extractedName: result.nameResult.extractedName,
          verified: result.nameResult.verificationResult.verified,
          exactMatch: result.nameResult.verificationResult.exactMatch,
          finalName: result.nameResult.studentName,
        })}`
      );
    } else {
      newInputPdf = await createDocument(req.body, file.originalname);
    }

    const job = await myQueue.add(
      {
        userId,
        inputPdf: newInputPdf,
        file,
        questionChoice,
      },
      {
        jobId: newInputPdf._id.toString(),
        attempts: 5,
        backoff: {
          type: "fixed",
          delay: 2000,
        },
        timeout: 1200000, //20 Minutes Timeout
      }
    );

    jobs.push(job);
  }

  return res.status(200).json({
    message: "Jobs added to queue",
    jobs,
  });
});

module.exports = googleVisionRouter;
