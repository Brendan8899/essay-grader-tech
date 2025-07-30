const { myQueue } = require("./QueueProvider.js");
const fs = require("fs-extra");
const path = require("path");
const pdf = require("pdf-parse");
const { fromPath } = require("pdf2pic");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");
const { hashPdf } = require("../utils/utils.js");
const { imageToBase64 } = require("../utils/encodeToBase64.js");
const { Storage } = require("@google-cloud/storage");
const vision = require("@google-cloud/vision");
const { getResponseFromAi } = require("./PromptChaining/PromptChainingLogic.js");
const logger = require("../utils/logger.js")("AIGraderWorker");

const { updateAIResponseToDocument, updateDuplicatedDocument } = require("./Document.service.js");
const {
  getAnnotation,
  getBoundingPolyVertices,
  getBoundaryX,
  rearrangeText,
  generateDescriptionLines,
  parseJSONString,
} = require("./GoogleVision.js");
const { removeStruckWords } = require("./VertexAI.js");
const {
  getAIResponseWithImages,
  getTextFromImages,
  getQuestionImagesFromStorage,
} = require("./OpenAI.js");
const { InputPdf } = require("../mongoDB_schema.js");
const mongoose = require("mongoose");
const { DOCUMENT } = require("../config");

const getFormattedDate = () => {
  const date = new Date();
  return date.toISOString().replace(/:/g, "-").replace(/\..+/, "");
};

// Initialize Google Cloud Storage
const storage = new Storage({
  keyFilename: "lenor-ai-google-storage.json",
});

const bucketName = process.env.GOOGLE_STORAGE_BUCKET_NAME;
const bucket = storage.bucket(bucketName);

const googleVisionClient = new vision.ImageAnnotatorClient({
  keyFilename: "google_vision.json",
});

const Redis = require("ioredis");
const redisConfig = require("../config").REDIS;
const redis = new Redis(redisConfig);

const uri = process.env.MONGODB_DB;

async function connect() {
  try {
    await mongoose.connect(uri, {
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    logger.info("Connected successfully to MongoDB!");
  } catch (error) {
    logger.error(error);
  }
}

connect();

myQueue.process(async (job) => {
  const { file, inputPdf, userId, questionChoice } = job.data;

  const timestamp = getFormattedDate();
  const folderName = `output_${userId}_${timestamp}`;
  const outputFolderPath = `C:/tmp/${folderName}`;
  const baseOutputPath = path.resolve(outputFolderPath);

  await fs.ensureDir(baseOutputPath);

  const tempPath = file.path;
  const folderFileName = path.parse(file.originalname).name;
  const outputPath = path.join(baseOutputPath, folderFileName);

  const imagesPath = path.join(outputPath, "images");
  const documentPath = path.join(outputPath, "documents");
  const labelledPath = path.join(outputPath, "labelled_image");

  // Google Storage Upload Folder
  const gsLabelledImagesPath = folderName + "/" + folderFileName + "/labelled_image/";
  const gsDocumentsName = folderName + "/" + folderFileName + "/documents/";

  await fs.ensureDir(outputPath);
  await fs.ensureDir(imagesPath);
  await fs.ensureDir(documentPath);
  await fs.ensureDir(labelledPath);

  const inputPdfFS = fs.readFileSync(tempPath);

  const inputPdfData = await pdf(inputPdfFS);

  const numPages = inputPdfData.numpages;

  const options = {
    quality: 100,
    density: 400,
    saveFilename: path.parse(tempPath).name,
    savePath: imagesPath,
    format: "png",
    width: DOCUMENT.WIDTH,
    height: DOCUMENT.HEIGHT,
  };

  const pdf2pic = fromPath(tempPath, options);

  const imagePaths = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf2pic(i);
    imagePaths.push(page.path);
  }

  let base64Array = [];
  for (const imagePath of imagePaths) {
    base64Array.push(imageToBase64(imagePath));
  }

  // Hashes PDF based on converted image
  const hashedPdf = hashPdf(base64Array.toString());
  const existingPdf = await InputPdf.findOne({
    hashedPdf,
    isModel: true,
    userId,
    processState: "processed",
  });
  await InputPdf.findByIdAndUpdate(inputPdf._id, { hashedPdf });

  if (existingPdf) {
    await updateDuplicatedDocument(inputPdf, existingPdf._doc);
    return `PDF already exists, using same results.`;
  }

  const extractedText = await getTextFromImages(base64Array);

  let imageFiles = await fs.readdir(imagesPath);

  const imagesResponse = imageFiles;

  const coordinateMaps = [];
  const pageTotalLines = [];
  const allSentences = [];

  for (const imageFile of imageFiles) {
    const imagePath = path.join(imagesPath, imageFile);
    const [results] = await googleVisionClient.documentTextDetection(imagePath);

    let processingArray = getBoundingPolyVertices(results);
    // We will remove the struck-through words here using Vertex AI!
    processingArray = await removeStruckWords(processingArray, imagePath);

    const [sentences, correspondingCoordinates] = rearrangeText(processingArray);
    allSentences.push(...sentences);
    coordinateMaps.push(...correspondingCoordinates);
    pageTotalLines.push(sentences.length);
  }

  const descriptionGroupsStr = generateDescriptionLines(allSentences);
  const checkerResponse = await getResponseFromAi(extractedText, descriptionGroupsStr);

  const checkerResponseJSON = parseJSONString(checkerResponse, extractedText, pageTotalLines);
  const boundary = getBoundaryX(coordinateMaps);
  const annotationResult = getAnnotation(checkerResponseJSON, allSentences, coordinateMaps);
  // Create object to store the original image
  // Create an empty canvas with width of a single page and height of all pages combined
  const pageHeight = options.height;
  let combinedImage = sharp({
    create: {
      width: options.width,
      height: pageHeight * numPages,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });
  // Prepare array of overlay operations - one for each page
  const compositeRawImageOperations = [];

  for (let i = 0; i < imageFiles.length; i++) {
    // Add the image to the composite operation
    compositeRawImageOperations.push({
      input: path.join(imagesPath, imageFiles[i]),
      top: i * pageHeight,
      left: 0,
    });
  }

  // Save the combined raw image
  const combinedBuffer = await combinedImage
    .composite(compositeRawImageOperations)
    .jpeg()
    .toBuffer();

  // Avoid saving to local but upload directly to Google Cloud Storage
  const rawImageDestination = gsDocumentsName + "raw_image.png";
  const rawImgBucketFile = bucket.file(
    `${process.env.GOOGLE_STORAGE_BUCKET_UPLOADED_FOLER}/${rawImageDestination}`
  );

  await rawImgBucketFile.save(combinedBuffer, {
    contentType: "image/png",
    metadata: {
      cacheControl: "public, max-age=31536000",
    },
  });

  logger.info("Combined raw image created and uploaded!");

  imageFiles = await fs.readdir(labelledPath);

  const pdfDoc = await PDFDocument.create();
  for (const imageFile of imageFiles) {
    const labeledImagePath = path.join(labelledPath, imageFile);
    const imageBytes = await fs.readFile(labeledImagePath);
    const image = await pdfDoc.embedPng(imageBytes);
    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });

    // Uploading labelled images
    await bucket.upload(labeledImagePath, {
      destination: "uploaded_documents/" + gsLabelledImagesPath + imageFile,
    });

    logger.info("GS Labelled Images Uploaded!!! ");
  }

  const pdfBytes = await pdfDoc.save();
  const finalPdfPath =
    outputFolderPath +
    "/" +
    path.parse(file.originalname).name +
    "/documents" +
    "final_document.pdf";

  await fs.writeFile(finalPdfPath, pdfBytes);

  const finalPdfDestinaton = gsDocumentsName + "final_document.pdf";

  // Upload the original PDF to Google Cloud Storage
  const originalPdfDestination = gsDocumentsName + "original_document.pdf";
  await bucket.upload(tempPath, {
    destination: `${process.env.GOOGLE_STORAGE_BUCKET_UPLOADED_FOLER}/${originalPdfDestination}`,
  });
  logger.info("Original PDF Uploaded!!!");

  // Uploading documents
  await bucket.upload(finalPdfPath, {
    destination: `${process.env.GOOGLE_STORAGE_BUCKET_UPLOADED_FOLER}/${finalPdfDestinaton}`,
  });

  const labelledImagesResponse = imageFiles;

  const fileResponse = {
    rawImgPath: rawImageDestination,
    folderName: folderName + "/" + folderFileName,
    finalPdfPath: finalPdfDestinaton,
    originalPdfPath: originalPdfDestination,
    images: imagesResponse,
    imagesLabelled: labelledImagesResponse,
    originalname: file.originalname,
    tempPath: file.path,
  };

  logger.info("GS Documents Uploaded!!!");

  var questionImageURL;
  if (questionChoice && questionChoice.filePaths) {
    questionImageURL = await getQuestionImagesFromStorage(questionChoice.filePaths);
  } else {
    questionImageURL = [];
  }

  // Prepare data object with all necessary fields, including grade
  const aiRequestData = {
    className: inputPdf.className,
    assignmentName: inputPdf.essayName,
    pointSystem: inputPdf.pointSystem,
    grade: inputPdf.grade,
    essayType: inputPdf.essayType,
    awardPoints: inputPdf.awardPoints || [],
    customInstructions: inputPdf.customInstructions,
  };

  logger.info("Preparing AI request with grade: " + inputPdf.grade);

  // Get AI Response from OpenAi
  const response = await getAIResponseWithImages(
    extractedText,
    aiRequestData,
    questionChoice,
    questionImageURL
  );

  try {
    await updateAIResponseToDocument(inputPdf, response, fileResponse, annotationResult, boundary);
  } catch (error) {
    logger.error(error);
  }

  fs.rmSync(baseOutputPath, { recursive: true, force: true });

  return `Job ${job.id} completed! Uploaded and graded document '${file.originalname}' successfully!`;
});

myQueue.on("failed", async (job, err) => {
  logger.error(err);

  if (job.attemptsMade >= job.opts.attempts) {
    const { userId, inputPdf } = job.data;

    redis.publish(
      "Document-Status",
      JSON.stringify({ userId: userId, newInputPdfid: inputPdf._id, processed: false })
    );

    await InputPdf.findByIdAndUpdate(
      inputPdf._id,
      {
        processState: "failed",
      },
      { new: true }
    );
  }
});

// Handle job completion
myQueue.on("completed", async (job, result) => {
  const { userId, inputPdf } = job.data;
  logger.info(`(ID: ${job.id}) completed with result: ${result}`);
  redis.publish(
    "Document-Status",
    JSON.stringify({ userId: userId, newInputPdfid: inputPdf._id, processed: true })
  );
});
