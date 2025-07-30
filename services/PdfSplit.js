const fs = require("fs-extra");
const { PDFDocument } = require("pdf-lib");
const { tmpdir } = require("os");
const path = require("path");
const { sendByUserId } = require("../websocket.js");

const getFormattedDate = () => {
  const date = new Date();
  return date.toISOString().replace(/:/g, "-").replace(/\..+/, "");
};

function requestBodySanityChecker(request_body) {
  if (Object.keys(request_body).length === 0) {
    throw new Error("Request body is empty");
  }
}

async function pdfDocumentsCompilation(fileNames, folderName, splitIndices) {
  let startIndex = 0;
  const documentGroups = [];
  const pdfPaths = [];

  // Create temp directory for our work
  const timestamp = getFormattedDate();
  const tempDirPath = path.join(tmpdir(), `split_pdf_${timestamp}`);
  await fs.ensureDir(tempDirPath);

  const pdfsDir = path.join(tempDirPath, "pdfs");
  await fs.ensureDir(pdfsDir);

  for (let i = 0; i < splitIndices.length; i++) {
    const endIndex = splitIndices[i];
    documentGroups.push(fileNames.slice(startIndex, endIndex + 1));
    startIndex = endIndex + 1;
  }

  // If there are remaining pages, add them as the last document
  if (startIndex < fileNames.length) {
    documentGroups.push(fileNames.slice(startIndex));
  }

  for (let i = 0; i < documentGroups.length; i++) {
    const group = documentGroups[i];
    const pdfDoc = await PDFDocument.create();
    for (let j = 0; j < group.length; j++) {
      const imageBytes = fs.readFileSync(path.resolve(folderName, group[j]));
      const image = await pdfDoc.embedJpg(imageBytes);
      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const pdfPath = path.join(pdfsDir, `document_${i + 1}.pdf`);
    await fs.writeFile(pdfPath, pdfBytes);
    pdfPaths.push(pdfPath);
  }
  return [pdfPaths, tempDirPath];
}

const sendProgressUpdate = (userId, progress) => {
  sendByUserId(userId, "progress-update", { progress });
};

async function pdfByteCompilation(fileNames, folderName, splitIndices, userId) {
  let startIndex = 0;
  const documentGroups = [];

  // Create temp directory for our work
  const timestamp = getFormattedDate();
  const tempDirPath = path.join(tmpdir(), `split_pdf_${timestamp}`);
  await fs.ensureDir(tempDirPath);

  // Create directories for images and PDFs
  const pdfsDir = path.join(tempDirPath, "pdfs");
  await fs.ensureDir(pdfsDir);

  for (let i = 0; i < splitIndices.length; i++) {
    const endIndex = splitIndices[i];
    documentGroups.push(fileNames.slice(startIndex, endIndex + 1));
    startIndex = endIndex + 1;
  }

  // If there are remaining pages, add them as the last document
  if (startIndex < fileNames.length) {
    documentGroups.push(fileNames.slice(startIndex));
  }

  let pdfBytesArray = [];

  for (let i = 0; i < documentGroups.length; i++) {
    const group = documentGroups[i];
    // Download all images in this group
    const pdfDoc = await PDFDocument.create();
    for (let j = 0; j < group.length; j++) {
      const imageBytes = fs.readFileSync(path.resolve(folderName, group[j]));
      const image = await pdfDoc.embedJpg(imageBytes);
      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      });
    }

    const pdfBytes = await pdfDoc.save();
    pdfBytesArray.push(pdfBytes);
    const progress = ((i + 1) / documentGroups.length) * 100;
    sendProgressUpdate(userId, progress);
  }
  return [pdfBytesArray, tempDirPath];
}

module.exports = {
  requestBodySanityChecker,
  pdfDocumentsCompilation,
  pdfByteCompilation,
  sendProgressUpdate,
};
