const aiplatform = require("@google-cloud/aiplatform");
const { PredictionServiceClient } = aiplatform;
const { instance } = aiplatform.protos.google.cloud.aiplatform.v1.schema.predict;
const fs = require("fs-extra");
const path = require("path");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger.js")("VertexAI");
const { uploadQueue } = require("./QueueProvider.js");

// Configure the Vertex AI endpoint
const VERTEX_AI_ENDPOINT_ID = process.env.VERTEX_STRIKETHROUGH_MODEL_ENDPOINT_ID;
const VERTEX_AI_PROJECT = process.env.GOOGLE_STORAGE_PROJECT_ID;
const VERTEX_AI_LOCATION = process.env.VERTEX_STRIKETHROUGH_LOCATION;
const STRUCK_THRESHOLD = 0.8; // Confidence threshold for struck-through words

// Use the fully qualified endpoint name format
const ENDPOINT = `projects/${VERTEX_AI_PROJECT}/locations/${VERTEX_AI_LOCATION}/endpoints/${VERTEX_AI_ENDPOINT_ID}`;

// Load the service account key file
const serviceAccountKey = JSON.parse(fs.readFileSync("lenor-ai-vertex-ai.json", "utf8"));

// Specifies the location of the API endpoint
const clientOptions = {
  apiEndpoint: `${VERTEX_AI_LOCATION}-aiplatform.googleapis.com`,
  credentials: serviceAccountKey,
};

// Initialize the client. Uses PredictionServiceClient because it is a prediction model
const client = new PredictionServiceClient(clientOptions);

// Model does not work well on punctuation. Automatically assume punctuation is intentional
const FILTERED_PUNCTUATION = /[.,!?;:]/;

/**
 * Remove struck-through words from the processingArray,
 * where T = [{x, y}, {x, y}, {x, y}, {x, y}, {description: "..."}]
 * @param {T[]} processingArray - Array of T, containing 4 (x, y) coordinates and 1 description, representing a word.
 * @param {String} originalImagePath - path to the image file of the page that we are processing.
 * @returns {T[]} - Returns the processingArray with struck-through words removed.
 */
async function removeStruckWords(processingArray, originalImagePath) {
  logger.info(`Processing ${processingArray.length} words for struckthrough word detection`);
  // Create a temporary directory to store the images
  const tempDir = path.join("C:/tmp", "strikethrough_check", `${uuidv4()}_working`);
  await fs.ensureDir(tempDir);

  try {
    // Get metadata once to use for validation (not for the extraction operations)
    await sharp(originalImagePath).metadata();

    // Process each element of the processingArray individually. Each word goes through:
    // 1. Extracting the vertices
    // 2. Calculating the bounding box
    // 3. Cropping the image (using sharp)
    // 4. Predicting if the word is cancelled (using Vertex AI)
    // 5. Returning the result
    const detectionPromises = processingArray.map(async (wordObject, index) => {
      return processWord(wordObject, index, originalImagePath, tempDir);
    });

    // Wait for all detection results
    const results = await Promise.all(detectionPromises);

    const filteredArray = processingArray.filter((_, index) => {
      const result = results[index];
      return !result || !result.isCancelled;
    });

    let newTempDir = tempDir.replaceAll("_working", "");

    fs.rename(tempDir, newTempDir);
    await uploadQueue.add({ fileToUploadPath: newTempDir });

    logger.info(`Removed ${processingArray.length - filteredArray.length} struck words`);
    return filteredArray;
  } catch (error) {
    logger.error(error);
    return processingArray;
  }
}

/**
 * Predicts if a word is cancelled using Vertex AI
 * @param {String} cropPath - Path to the cropped image of the word.
 * @returns {Object} - Returns an object containing the prediction result.
 *  Cancelled is true if the word is cancelled, false otherwise. Confidence is the confidence score of the prediction.
 */
async function predictWord(cropPath) {
  try {
    // encode word image to base64
    const wordImage = fs.readFileSync(cropPath, "base64");

    // Create proper instance for image classification
    const instanceObj = new instance.ImageClassificationPredictionInstance({
      content: wordImage,
    });
    const instanceValue = instanceObj.toValue();
    const instances = [instanceValue];

    // Make the prediction with proper format
    const [response] = await client.predict(
      {
        endpoint: ENDPOINT,
        instances,
      },
      {
        timeout: 120000, //2 Minutes Time Out to Deal with Heavy Throughput
      }
    );

    // Parse the prediction result
    const prediction = response.predictions[0];

    // Extract data from the nested structure
    const fields = prediction.structValue.fields;
    const displayNames = fields.displayNames;
    const confidences = fields.confidences;

    // Check if "struck" is in the displayNames
    const struckIndex = displayNames.listValue.values.findIndex(
      (item) => item.stringValue === "struck"
    );

    const cancelled = struckIndex !== -1;
    const confidence = cancelled ? confidences.listValue.values[struckIndex].numberValue : 0;

    if (cancelled && confidence >= STRUCK_THRESHOLD) {
      return { cancelled: true, confidence };
    }
    return { cancelled: false, confidence: 0 };
  } catch (error) {
    logger.error(error);
    return { cancelled: false, confidence: 0 };
  }
}

/**
 * Process a word object, extracting the vertices, calculating the bounding box, cropping the image, and predicting if the word is cancelled.
 * @param {Object} wordObject - The word object to process.
 * @param {number} index - The index of the word in the processingArray.
 * @param {string} originalImagePath - The path to the original image.
 * @param {string} tempDir - The temporary directory to store the cropped image.
 * @returns {Object} - Returns an object containing the result of the processing.
 */
async function processWord(wordObject, index, originalImagePath, tempDir) {
  const word = wordObject[4]["description"];

  // If the word is a punctuation, we will not process it, as model does not work well on punctuation
  if (FILTERED_PUNCTUATION.test(word)) {
    return { index, word: wordObject, isCancelled: false, confidence: 0, gcsPath: null };
  }

  // 1. Extract vertices
  const vertices = wordObject.slice(0, 4);
  // 2. Calculate bounding box for extract with sharp
  const left = Math.min(...vertices.map((v) => v.x)); // use min because sharp is top left origin
  const top = Math.min(...vertices.map((v) => v.y)); // use min because sharp is top left origin
  const right = Math.max(...vertices.map((v) => v.x));
  const bottom = Math.max(...vertices.map((v) => v.y));

  const width = right - left;
  const height = bottom - top;

  // 3. Crop and save the image
  const cropPath = path.join(tempDir, `word_${index}.jpg`);
  try {
    // Create a new Sharp instance for each word to avoid concurrent operations
    await sharp(originalImagePath)
      .extract({
        left: left,
        top: top,
        width: width,
        height: height,
      })
      .toFile(cropPath);

    // 4. Predict if the word is cancelled (using Vertex AI)
    const prediction = await predictWord(cropPath);

    // 5. Return the result
    return {
      index,
      word: wordObject,
      isCancelled: prediction.cancelled,
      confidence: prediction.confidence,
    };
  } catch (error) {
    logger.error(error);
    return { index, word: wordObject, isCancelled: false, confidence: 0, gcsPath: null };
  }
}
module.exports = {
  removeStruckWords,
};
