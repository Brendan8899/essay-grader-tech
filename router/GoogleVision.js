const express = require("express");
const logger = require("../utils/logger.js")("GoogleVisionRouter");
const multer = require("multer");
const { createDocument, createDocumentWithVerification } = require("../services/Document.service");
const { InputQuestionPdf } = require("../mongoDB_schema.js");
const { myQueue } = require("../services/QueueProvider.js");

const googleVisionRouter = express.Router();
const upload = multer({ dest: "C:/tmp/" });

googleVisionRouter.post("/upload", upload.array("files"), async (req, res) => {
  const jobs = [];

  const { className, questionId } = req.body;
  const questionChoice = questionId ? await InputQuestionPdf.findById(questionId) : null;

  const files = req.files;
  logger.info("Iterating Through Files");
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let newInputPdf;

    // If className is provided, use student name verification
    if (className) {
      // Create a temporary path for processing
      const timestamp = new Date().getTime();
      const outputBasePath = `C:/tmp/name_extraction_${req.user.uid}_${timestamp}`;

      // Create the document with student name verification
      const result = await createDocumentWithVerification(
        req.user.uid,
        req.body,
        file.originalname,
        file.path,
        outputBasePath
      );

      newInputPdf = result.document;

      // Log verification result
      logger.info(
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
        userId: req.user.uid,
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

    logger.info(`Job added to queue: ${job.id}`);

    jobs.push(job);
  }

  return res.status(200).json({
    message: "Jobs added to queue",
    jobs,
  });
});

module.exports = googleVisionRouter;
