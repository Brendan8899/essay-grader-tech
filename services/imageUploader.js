const fs = require("fs-extra");
const path = require("path");
const { Storage } = require("@google-cloud/storage");
const { uploadQueue } = require("./QueueProvider.js");
const logger = require("../utils/logger.js")("ImageUploader");

const storage = new Storage({
  keyFilename: "lenor-ai-google-storage.json",
});

const bucketName = process.env.VERTEX_STRIKETHROUGH_BUCKET_NAME;
const bucket = storage.bucket(bucketName);

uploadQueue.process(async (job) => {
  let { fileToUploadPath } = job.data;
  const images = fs.readdirSync(fileToUploadPath);
  let promiseArray = [];
  for (const image of images) {
    const imagePath = path.join(fileToUploadPath, image);
    try {
      promiseArray.push(
        bucket.upload(imagePath, {
          destination: `extracted_words/${image}`,
          metadata: { contentType: "image/jpeg" },
        })
      );
    } catch {
      logger.error("Error Uploading to Google Cloud Storage");
    }
  }

  if (promiseArray.length > 0) {
    await Promise.all(promiseArray);
  }

  fs.removeSync(fileToUploadPath);
});
