const { FabricImage, StaticCanvas } = require("fabric/node");
const DOCUMENT = require("../../config/document.js");
const { exportCanvas } = require("./canvasToPdf.js");
const { InputPdf, InputPdfCanvas } = require("../../mongoDB_schema.js");
const { generateFeedback } = require("./generateFeedback.js");
const { markdownToPdfBytes } = require("../../utils/markdownStringToPdf.js");
const { PDFDocument } = require("pdf-lib");
const logger = require("../../utils/logger.js")("AppendFeedbackService");
const { createAnnotations } = require("./annotationGenerator.js");
const archiver = require("archiver");

/**
 * Appends feedback to multiple documents and streams them as a ZIP file.
 *
 * @param {string[]} documentIds The IDs of the documents to append feedback to
 * @param {string[]} options Feedback options selected by the user
 * @param {Response} res The response object to stream the ZIP file
 * @returns {Promise<void>}
 */
async function massAppendFeedback(documentIds, options, res) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res); // Stream directly to client

  const promises = documentIds.map(async (documentId) => {
    const resultPdfBuffer = await appendFeedback(documentId, options, true);
    const fileEntry = await InputPdf.findById(documentId);
    const fileName = fileEntry.filename;
    return { fileName, resultPdfBuffer };
  });

  const results = await Promise.all(promises);

  for (const { fileName, resultPdfBuffer } of results) {
    archive.append(resultPdfBuffer, { name: `${fileName}` });
  }

  archive.on("finish", () => {
    const sizeInBytes = archive.pointer();
    logger.info(`ZIP size: ${sizeInBytes} bytes`);
  });

  archive.finalize();
}

/**
 * Generates a graded PDF with feedback for a single document. It simulates the canvas rendering and generate
 * the annotations directly from the `fabric.canvas` object.
 *
 * @param {string} documentId The ID of the document
 * @param {string[]} options The options for the feedback
 * @param {boolean} includeFeedbackError Whether to include feedback error
 * @returns {Promise<Buffer>} The merged PDF as a buffer
 */
async function appendFeedback(documentId, options, includeFeedbackError) {
  const document = await InputPdf.findById(documentId);
  if (!document) {
    throw new Error(`Document not found for documentId: ${documentId}`);
  }

  const rawImgUrl = `${process.env.GOOGLE_STORAGE_BUCKET}/${process.env.GOOGLE_STORAGE_BUCKET_UPLOADED_FOLER}/${document.rawImgPath}`;
  const canvasEntry = await InputPdfCanvas.findOne({ inputPdfID: documentId });

  let canvasStr = canvasEntry?.canvasString;
  const hasValidCanvasString = document.canvasSave && canvasEntry?.canvasString?.length > 0;
  if (!hasValidCanvasString) {
    canvasStr = await simulateCanvasString(documentId, rawImgUrl);
    if (!canvasStr) {
      throw new Error("Failed to simulate canvas string");
    }
  }

  const canvasJSON = JSON.parse(canvasStr);
  // create a fake canvas
  const bg = await FabricImage.fromURL(rawImgUrl);

  const canvasHeight = bg.height;
  const canvas = new StaticCanvas(null, {
    width: DOCUMENT.WIDTH,
    height: canvasHeight,
  });

  canvas.backgroundImage = bg;

  const temp = await canvas.loadFromJSON(canvasJSON);
  temp.renderAll();

  // export to pdf using the canvas
  const pdf = await exportCanvas(
    temp,
    document.annotations,
    document.userAnnotations,
    includeFeedbackError
  );

  const markdownString = generateFeedback(options, document, includeFeedbackError);
  const markdownBytes = await markdownToPdfBytes(markdownString, DOCUMENT.WIDTH, DOCUMENT.HEIGHT);
  const mergedBytes = await appendFeedbacktoDocument(markdownBytes, pdf.output("arraybuffer"));

  return mergedBytes;
}

/**
 * Simulates the canvas rendering for a document and saves it as a JSON string.
 *
 * @param {string} documentId The ID of the document to simulate.
 * @param {string} rawImgUrl The URL of the background image.
 * @returns {Promise<string>} The serialized canvas JSON string.
 */
async function simulateCanvasString(documentId, rawImgUrl) {
  const document = await InputPdf.findById(documentId);
  if (!document) {
    throw new Error(`Document not found for documentId: ${documentId}`);
  }

  const bg = await FabricImage.fromURL(rawImgUrl);

  const canvasHeight = bg.height;
  const canvas = new StaticCanvas(null, {
    width: DOCUMENT.WIDTH,
    height: canvasHeight,
  });

  canvas.backgroundImage = bg;

  if (document.annotations) {
    const isPreviousVersion = Array.isArray(document.boundary) && document.boundary.length <= 0; //boundary not appear previously
    const annotationObjects = createAnnotations(document.annotations, isPreviousVersion);
    annotationObjects.forEach((obj) => canvas.add(obj));
    canvas.renderAll();
  }

  const canvasJSON = canvas.toObject(["data", "dataUserAnnotation", "isUserAnnotation"]);
  const canvasString = JSON.stringify(canvasJSON);

  // save to database, but don't make the canvas save to true
  const result = await InputPdfCanvas.findOneAndUpdate(
    { inputPdfID: documentId },
    { canvasString: canvasString },
    { upsert: true, new: true }
  );
  if (!result) {
    throw new Error("Failed to save canvas string");
  }

  return canvasString;
}

/**
 * Combines two PDFs into one by appending the feedback PDF to the original main document.
 *
 * @param {Uint8Array} markdownBytes A Uint8Array representing the feedback content as a PDF
 * @param {Buffer} pdfBuffer The original PDF document to append feedback to.
 * @returns {Promise<Buffer>} The merged PDF as a buffer
 */
async function appendFeedbacktoDocument(markdownBytes, pdfBuffer) {
  try {
    const mainPdf = await PDFDocument.load(pdfBuffer);
    const feedbackPdf = await PDFDocument.load(markdownBytes);
    const mergedPdf = await PDFDocument.create();

    const mainPages = await mergedPdf.copyPages(mainPdf, mainPdf.getPageIndices());
    mainPages.forEach((page) => mergedPdf.addPage(page));

    const feedbackPages = await mergedPdf.copyPages(feedbackPdf, feedbackPdf.getPageIndices());
    feedbackPages.forEach((page) => mergedPdf.addPage(page));

    const mergedBytes = await mergedPdf.save();
    return Buffer.from(mergedBytes);
  } catch (error) {
    logger.error("Error in appeding feedback", error);
    return pdfBuffer;
  }
}

module.exports = { appendFeedback, massAppendFeedback };
