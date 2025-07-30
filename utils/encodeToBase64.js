const axios = require("axios");
const fs = require("fs-extra");
const logger = require("./logger.js")("encodeToBase64");
const pdfParse = require("pdf-parse");
const { convertDocxToPDF } = require("./convertToPdf");
const { fromBuffer } = require("pdf2pic");
const { cacheImagesFromDocx } = require("../mongoDB_schema");
const murmurhash3 = require("murmurhash3js");

const downloadFile = async (url) => {
  const response = await axios.get(url, { responseType: "arraybuffer" });

  return {
    buffer: Buffer.from(response.data, "binary"),
    contentType: response.headers["content-type"] || null,
  };
};

const encodeToBase64 = async (url, questionID = null) => {
  const { buffer, contentType } = await downloadFile(url);
  var base64Encoded;

  if (contentType == "image/png" || contentType == "image/jpeg") {
    base64Encoded = [buffer.toString("base64")];
  } else if (contentType == "application/pdf") {
    base64Encoded = convertPdfToBase64Images(buffer);
  } else if (
    contentType == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const processArray = url.split("/");
    const fileName = processArray[processArray.length - 1];
    const hashID = murmurhash3.x86.hash128(`${questionID} ${fileName}`);
    const cachedImages = await cacheImagesFromDocx.find({ hashID: hashID });
    base64Encoded = cachedImages.map((cachedImage) => cachedImage.base64.toString("base64"));
  }

  return base64Encoded;
};

const imageToBase64 = (filePath) => {
  try {
    const imageBuffer = fs.readFileSync(filePath);

    const base64String = imageBuffer.toString("base64");

    return base64String;
  } catch (error) {
    logger.error(error);
    return null;
  }
};

const convertPdfToBase64Images = async (pdfBuffer) => {
  let pageCount;
  try {
    const { numpages } = await pdfParse(pdfBuffer);
    pageCount = numpages;
  } catch (err) {
    logger.error(err);
    return [];
  }

  const pdf2pic = fromBuffer(pdfBuffer, {
    density: 100,
    format: "png",
    width: 595,
    height: 842,
  });

  try {
    const pages = [];
    for (let i = 1; i <= pageCount; i++) {
      pages.push(i);
    }
    const results = await pdf2pic.bulk(pages, {}); // <- array, not { array }

    var base64Images = [];
    const imagePaths = results.map((r) => r.path);
    imagePaths.forEach((imagePath) => {
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString("base64");
      base64Images.push(base64Image);
    });

    for (const r of results) {
      try {
        fs.unlinkSync(r.path);
      } catch (unlinkErr) {
        logger.error(unlinkErr);
      }
    }

    return base64Images;
  } catch (error) {
    logger.error(error);
    return [];
  }
};

const convertDocToBase64ImageAndCache = async (file, questionID) => {
  try {
    const base64ImageArray = await convertDocToBase64Image(file);
    for (const base64Image of base64ImageArray) {
      const inputImageBase64 = Buffer.from(base64Image, "base64");
      const hashID = murmurhash3.x86.hash128(`${questionID.toString()} ${file.originalname}`);
      await cacheImagesFromDocx.create({ hashID: hashID, base64: inputImageBase64 });
    }
    return base64ImageArray;
  } catch (error) {
    logger.error(error);
  }
};

const convertDocToBase64Image = async (file) => {
  try {
    const pdfBuffer = await convertDocxToPDF(file);
    const base64Image = await convertPdfToBase64Images(pdfBuffer);
    return base64Image;
  } catch (error) {
    logger.error(error);
  }
};

module.exports = {
  encodeToBase64,
  imageToBase64,
  convertPdfToBase64Images,
  convertDocToBase64Image,
  convertDocToBase64ImageAndCache,
};
