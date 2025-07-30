const { Counter } = require("../mongoDB_schema");
const fs = require("fs");
const murmur = require("murmurhash3js");

async function getNextSequence(name) {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

const deleteFilePath = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err) {
        reject(new Error("File not found or could not be deleted"));
      } else {
        resolve();
      }
    });
  });
};

const getFileType = (filePath) => {
  return filePath.slice((Math.max(0, filePath.lastIndexOf(".")) || Infinity) + 1);
};

const hashPdf = (pdf) => {
  return murmur.x86.hash128(pdf);
};

module.exports = { getNextSequence, deleteFilePath, getFileType, hashPdf };
