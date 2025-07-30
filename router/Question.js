const express = require("express");
const multer = require("multer");
const Queue = require("bull");
const logger = require("../utils/logger.js")("QuestionRouter");
const redisConfig = require("../config").REDIS;
const fs = require("fs-extra");
const path = require("path");
const { Storage } = require("@google-cloud/storage");
const {
  imageToBase64,
  convertPdfToBase64Images,
  convertDocToBase64ImageAndCache,
} = require("../utils/encodeToBase64.js");
const {
  getTextFromImages,
  createQuestion,
  searchConditionConstructor,
  updateQuestion,
} = require("../services/Question.js");
const { InputQuestionPdf } = require("../mongoDB_schema");
const { z } = require("zod");
const { getFileType } = require("../utils/utils.js");

// Initialize a Bull queue
const myQueue = new Queue("questionQueue", {
  redis: redisConfig,
});

// Upload files
const upload = multer({ dest: "/tmp/question" });

// Initialize Google Cloud Storage
const storage = new Storage({
  keyFilename: "lenor-ai-google-storage.json",
});

const bucketName = "lenor-bucket";
const bucket = storage.bucket(bucketName);

const questionRouter = express.Router();

questionRouter.get("/", (_req, res) => {
  res.send("Welcome to the questionRouter server!");
});

// CRUD Operations
// Please refer to zod schema
const Question = z.object({
  topic: z.string(),
  instruction: z.string(),
  _id: z.string(),
});

questionRouter.post("/list", async (req, res) => {
  // not implement filter yet
  try {
    const { page, filter = {} } = req.body || {};

    let searchConditions = searchConditionConstructor(req.user.uid, filter);

    const documents = await InputQuestionPdf.find(searchConditions)
      .sort({ createdAt: -1 })
      .skip((page - 1) * 10)
      .limit(10)
      .exec();
    const response = documents.map((d) => ({
      _id: d._id,
      fileName: d.filename,
      userId: d.userId,
      topic: d.topic,
      instruction: d.instruction,
      createdAt: d.createdAt || new Date(0),
    }));
    res.status(200).json({ msg: "ok", body: response });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ msg: "Internal Server Error" });
  }
});

async function deleteFile(fileName) {
  const targetFile = process.env.GOOGLE_STORAGE_BUCKET_UPLOADED_QUESTIONS + "/" + fileName;
  logger.info("Delete File Triggered");
  try {
    await bucket.file(targetFile).delete();
  } catch (_error) {
    logger.error("Error occurred during the deletion of Files");
  }
}

questionRouter.post("/update", upload.array("files"), async (req, res) => {
  if (!InputQuestionPdf) {
    return res.status(200).send("cannot connect to mongodb");
  }
  const _id = req.body["_id"];
  const topic = req.body["topic"];
  const instruction = req.body["instruction"];
  const googleStoragePaths = req.body["google-storage-url"];

  const filter = { _id: _id };
  const update = {};
  if (topic) update["topic"] = topic;
  if (instruction) update["instruction"] = instruction;

  const uploadedHost = `${process.env.GOOGLE_STORAGE_BUCKET}/${process.env.GOOGLE_STORAGE_BUCKET_UPLOADED_QUESTIONS}`;
  const filePaths = googleStoragePaths ? googleStoragePaths.split(",") : [];

  if (googleStoragePaths) {
    update["filePaths"] = filePaths.map((filePath) =>
      filePath.replace(new RegExp(`${uploadedHost}/`, "g"), "")
    );
  } else {
    update["filePaths"] = [];
  }

  // delete unused google storage files
  const currentRes = await InputQuestionPdf.findOne({ _id: _id });
  if (!currentRes) {
    res.status(500).send(`An error occured: cannot find _id: ${_id} from the database.`);
  }

  const currentFilePaths = currentRes["filePaths"];

  const deletedFiles = googleStoragePaths
    ? currentFilePaths.filter((file) => !update["filePaths"].includes(file))
    : currentFilePaths;

  deletedFiles.forEach(deleteFile);

  // todo: handle added files
  const files = req.files ?? [];
  for await (const file of files) {
    const timestamp = getFormattedDate();
    const folderName = `output_${req.user.uid}_${timestamp}`;
    const tempPath = file.path;
    const folderFileName = path.parse(file.originalname).name;
    const gsDocumentsName = folderName + "/" + folderFileName + "/questions/";
    const finalPdfDestinaton = gsDocumentsName + `${file.originalname}`;
    update["filePaths"].push(finalPdfDestinaton);
    try {
      await bucket.upload(tempPath, {
        destination: `${process.env.GOOGLE_STORAGE_BUCKET_UPLOADED_QUESTIONS}/${finalPdfDestinaton}`,
      });
    } catch (_error) {
      logger.error("Failed to upload file");
    }
  }

  // update with mongoDB database

  const updateRes = await InputQuestionPdf.findOneAndUpdate(filter, update);
  if (!updateRes) {
    res.status(500).send(`An error occured: cannot find _id: ${_id} from the database.`);
  }

  res.status(200).json({ msg: `Successfuly updated` });
});

questionRouter.post("/delete", async (req, res) => {
  const updateQuestion = Question.safeParse(req.body);
  if (updateQuestion.success == false) {
    return res.status(200).send("Invalid request. Expected topic, instruction, and _id");
  }
  if (!InputQuestionPdf) {
    return res.status(200).send("cannot connect to mongodb");
  }
  const _id = updateQuestion.data["_id"];
  const topic = updateQuestion.data["topic"];
  const instruction = updateQuestion.data["instruction"];

  const filter = { _id: _id };
  const update = {};
  if (topic) update["topic"] = topic;
  if (instruction) update["instruction"] = instruction;

  // delete unused google storage files
  const currentRes = await InputQuestionPdf.findOne({ _id: _id });
  if (!currentRes) {
    res.status(500).send(`An error occured: cannot find _id: ${_id} from the database.`);
  }

  const deletedFiles = currentRes["filePaths"];
  deletedFiles.forEach(deleteFile);

  const updateRes = await InputQuestionPdf.findOneAndDelete(filter, update);
  if (!updateRes) {
    res.status(500).send(`An error occured: cannot find _id: ${_id} from the database.`);
  }
  res.status(200).json({ msg: `Successfuly delete ${update}` });
});

const getFormattedDate = () => {
  const date = new Date();
  return date.toISOString().replace(/:/g, "-").replace(/\..+/, "");
};

// handling jobs
myQueue.process(async (job) => {
  logger.info(`⚙️ Processing job ${job.id}`);
  // handling file directories
  const { files, instruction, userId } = job.data;
  let { topic } = job.data;
  const timestamp = getFormattedDate();
  let baseOutputPath = undefined;
  const isUploadingExistingQuestion = instruction === "";
  // Case 1: user has uploaded a file.
  // Case 1.1 If `instruction` is specified, no OpenAI is required.
  // Case 1.2 Otherwise, OpenAI is required.
  // Case 2: No files are provided: user must provide `instruction` for this task.

  var base64Images = [];
  if (files.length > 0) {
    const googleStoragePaths = [];
    for await (const file of files) {
      const folderName = `output_${userId}_${timestamp}`;
      const outputFolderPath = `C:/tmp/question/${folderName}`;
      baseOutputPath = path.resolve(outputFolderPath);
      await fs.ensureDir(baseOutputPath);
      const tempPath = file.path;
      logger.info("PROCESSING", tempPath);
      const folderFileName = path.parse(file.originalname).name;
      const outputPath = path.join(baseOutputPath, folderFileName);
      await fs.ensureDir(outputPath);
      const gsDocumentsName = folderName + "/" + folderFileName + "/questions/";
      // check file type
      const inputFileType = getFileType(file.originalname);
      // extract images (for OpenAI)
      var newQuestionId;
      if (isUploadingExistingQuestion) {
        newQuestionId = await createQuestion({ userId, topic, instruction: "Processing" }, []);
        if (["jpg", "jpeg", "png"].includes(inputFileType)) {
          const pictureBytes = fs.redFileSync(tempPath);
          base64Images.push(imageToBase64(pictureBytes));
        } else if (inputFileType === "pdf") {
          const pdfBytes = fs.readFileSync(tempPath);
          base64Images = base64Images.concat(await convertPdfToBase64Images(pdfBytes));
        } else if (inputFileType === "doc" || inputFileType === "docx") {
          base64Images = base64Images.concat(
            await convertDocToBase64ImageAndCache(file, newQuestionId._id)
          );
        } else {
          throw new Error(`Invalid file type`);
        }
      }
      // uploaded all files to Google storage
      const finalPdfDestinaton = gsDocumentsName + `${file.originalname}`;
      const finalPdfDestinatonGS = `${process.env.GOOGLE_STORAGE_BUCKET_UPLOADED_QUESTIONS}/${finalPdfDestinaton}`;
      try {
        await bucket.upload(tempPath, {
          destination: finalPdfDestinatonGS,
        });
      } catch (_error) {
        logger.error("Failed to upload file");
      }
      googleStoragePaths.push(finalPdfDestinaton);
    }

    // Case 1.1: No instruction has been provided: use OpenAI to extract instruction.
    if (isUploadingExistingQuestion) {
      logger.info(`✨ Processing ...`);
      logger.info("⚙️ READ ALL IMAGES");
      let text = await getTextFromImages(base64Images);
      text = text.replace(/^```json|```$/g, "").trim();
      const extractedText = JSON.parse(text);
      if (topic === "") topic = extractedText["topic"];
      const instruction = extractedText["instruction"];
      await updateQuestion({ userId, topic, instruction }, googleStoragePaths, newQuestionId._id);
    } else {
      await createQuestion({ userId, topic, instruction }, googleStoragePaths);
    }
  } else {
    // Case 2: No files are provided.
    if (instruction == "") {
      throw new Error(`Invalid ${job.id}: Instruction must be provided.`);
    } else {
      await createQuestion({ userId, topic, instruction }, []);
    }
  }

  if (baseOutputPath) {
    fs.rmSync(baseOutputPath, { recursive: true, force: true });
  }

  return `Job ${job.id} completed!`;
});

// Handle job completion
myQueue.on("completed", (job, result) => {
  logger.info(`Job ${job.id} completed with result: ${result}`);
});

// Handle job failure
myQueue.on("failed", async (_job, err) => {
  logger.error(err);
});

questionRouter.post("/upload", upload.array("files"), async (req, res) => {
  const outputFolderPath = `C:/tmp/question`;
  const baseOutputPath = path.resolve(outputFolderPath);
  await fs.ensureDir(baseOutputPath);

  // set key to file
  const questionTopic = req.body.topic ?? ""; // string (can be empty string '')
  const questionInstruction = req.body.instruction ?? "";
  const files = req.files ?? [];
  const jobs = [];

  // merge every file into one file
  const job = await myQueue.add({
    files: files,
    topic: questionTopic,
    instruction: questionInstruction,
    userId: req.user.uid,
  });
  jobs.push(job);
  return res.status(200).json({
    message: "Jobs added to queue",
    jobs,
  });
});

questionRouter.get("/:id", async (req, res) => {
  const item = await InputQuestionPdf.findById(req.params.id);
  if (!item) return res.status(404).json({ message: "Question is not found" });
  const uploadedHost = `${process.env.GOOGLE_STORAGE_BUCKET}/${process.env.GOOGLE_STORAGE_BUCKET_UPLOADED_QUESTIONS}`;
  const filePaths = item.filePaths.map((filePath) => {
    return uploadedHost + "/" + filePath;
  });
  const result = { ...item, _doc: { ...item._doc, filePaths } };
  return res.status(200).json(result._doc);
});

module.exports = questionRouter;
