const express = require("express");
const multer = require("multer");
const logger = require("../utils/logger.js")("PdfSplitRouter");
const fs = require("fs-extra");
const pdf = require("pdf-parse");
const { fromPath } = require("pdf2pic");
const path = require("path");
const archiver = require("archiver");
const {
  requestBodySanityChecker,
  pdfDocumentsCompilation,
  pdfByteCompilation,
  sendProgressUpdate,
} = require("../services/PdfSplit");
const DOCUMENT = require("../config").DOCUMENT;

// Upload files
const upload = multer({ dest: "/tmp/splitPDF" });

const pdfSplitRouter = express.Router();

const getFormattedDate = () => {
  const date = new Date();
  return date.toISOString().replace(/:/g, "-").replace(/\..+/, "");
};

const formatSplitIndices = (splitIndices) => {
  const isSplitIndicesArray = splitIndices && Array.isArray(splitIndices);
  if (isSplitIndicesArray) {
    splitIndices.sort((a, b) => a - b);
  }
};

pdfSplitRouter.post("/processSplitPDF", upload.single("file"), async (req, res) => {
  const files = req.file ? req.file : null;
  if (!files) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const timestamp = getFormattedDate();
  const tempPath = files.path;

  const inputPdfFS = fs.readFileSync(tempPath);
  const inputPdfData = await pdf(inputPdfFS);
  const numPages = inputPdfData.numpages;
  const outputFolderPath = `C:/tmp/pdfsplit_${req.user.uid}_${timestamp}`;
  const baseOutputPath = path.resolve(outputFolderPath);
  await fs.ensureDir(baseOutputPath);

  const options = {
    quality: 100,
    density: 300,
    saveFilename: path.parse(tempPath).name,
    savePath: baseOutputPath,
    format: "jpeg",
    width: DOCUMENT.WIDTH,
    height: DOCUMENT.HEIGHT,
  };

  const pdf2pic = fromPath(tempPath, options);

  let result = {};
  result.folderName = baseOutputPath;
  result.fileNames = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf2pic(i);
    const progress = (i / numPages) * 100;
    sendProgressUpdate(req.user.uid, progress);
    let pathNormalized = path.normalize(page.path);
    result.fileNames.push(pathNormalized);
    let pageBytes = fs.readFileSync(pathNormalized);
    result[i] = pageBytes;
  }

  res.status(200).json(result);
});

pdfSplitRouter.post("/splitPDFdownload", async (req, res, next) => {
  requestBodySanityChecker(req.body);
  const { fileNames, folderName, discardFile } = req.body;
  const splitIndices = req.body.splitIndices;
  formatSplitIndices(splitIndices);
  const [pdfPaths, tempDirPath] = await pdfDocumentsCompilation(
    fileNames,
    folderName,
    splitIndices
  );

  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": 'attachment; filename="split_documents.zip"',
  });

  if (discardFile) {
    fs.removeSync(folderName);
    return res.status(204).end();
  }

  // create the archive and pipe to the response
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", next);
  archive.on("close", () => fs.emptyDir(tempDirPath).catch(logger.error));
  archive.pipe(res);

  // append each PDF file
  pdfPaths.forEach((pdfPath) => {
    archive.file(pdfPath, { name: path.basename(pdfPath) });
  });

  await archive.finalize();
});

pdfSplitRouter.delete("/", async (req, res) => {
  const folderName = req.body?.folderName;
  if (!folderName) {
    return res.status(400).json({ error: "Empty folder name." });
  }

  fs.remove(folderName).catch(logger.error);
  return res.status(201).send();
});

pdfSplitRouter.post("/splitPDFBytes", async (req, res) => {
  requestBodySanityChecker(req.body);

  const { fileNames, folderName } = req.body;
  const splitIndices = req.body.splitIndices;
  formatSplitIndices(splitIndices);
  const [pdfBytes, tempDirPath] = await pdfByteCompilation(
    fileNames,
    folderName,
    splitIndices,
    req.user.uid
  );

  fs.emptyDir(tempDirPath).catch(logger.error);

  const pdfs = pdfBytes.map((bytes, idx) => ({
    name: `split_document_${idx + 1}.pdf`,
    data: Buffer.from(bytes).toString("base64"),
  }));

  fs.emptyDir(folderName).catch(logger.error);

  return res.status(200).json(pdfs);
});

module.exports = pdfSplitRouter;
