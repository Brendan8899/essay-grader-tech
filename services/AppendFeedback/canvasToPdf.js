const { jsPDF } = require("jspdf");
const { StaticCanvas: _StaticCanvas, Point, FabricObject: _FabricObject } = require("fabric/node");
const { createCanvas, loadImage } = require("canvas");
const DOCUMENT = require("../../config/document");
const PDF_SCALE_FACTOR = 1.2;

/**
 * Groups canvas annotation objects by page number and computes the feedback point for each.
 *
 * @param {Object[]} groups Array of Fabric.js objects (groups) on the canvas.
 * @param {number} pageHeight
 * @returns An object where each key is a page number and each value is an array of annotation metadata,
 * including feedback point and position.
 */
function groupAnnotationsByPage(groups, pageHeight) {
  const result = {};
  groups.forEach((group) => {
    const page = Math.floor(group?.canvasPosition?.top / pageHeight);
    if (!result[page]) result[page] = [];
    result[page].push(group);
  });
  return result;
}

function splitTextIntoLines(text, maxWidth, fontSize, pdf) {
  if (!text || !pdf) return [text];

  // Set font size for accurate measurement
  pdf.setFontSize(fontSize);

  const words = text.split(" ");
  const lines = [];
  let currentLine = words[0] || "";

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine + " " + word;

    // Use jsPDF's getTextWidth for accurate measurement
    const width = pdf.getTextWidth(testLine);

    if (width < maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [text];
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

const PADDING = 5;
const FONT_SIZE = 17;
const LINE_HEIGHT = FONT_SIZE * 1.2;
const TOP_MARGIN = 20;
const BOTTOM_MARGIN = 20;
const SPACING = 4; // vertical gap between boxes
const CANVAS_RATIO = 1 / PDF_SCALE_FACTOR;

/**
 * Draws the feedback side-panel for one PDF page.
 *
 * @param {jsPDF} pdf jsPDF instance to draw on.
 * @param {number} pdfWidth Full width of the PDF page.
 * @param {number} pageHeight Height of the current PDF page.
 * @param {Object[]} feedbacks Feedback objects (must contain feedback, annotationType, feedbackPoint | canvasPosition).
 * @param {number} sliceTop Vertical offset of the current canvas slice rendered on this page.
 */
function drawFeedbackPanelFromCanvas(pdf, pdfWidth, pageHeight, feedbacks, sliceTop) {
  const panelX = pdfWidth * CANVAS_RATIO + PADDING;
  const panelW = pdfWidth * (1 - CANVAS_RATIO) - PADDING;

  const regions = preprocess(feedbacks, sliceTop, panelW, pdf, pageHeight);

  resolveOverlapping(regions, pageHeight);

  drawBoxes(pdf, regions, panelX, panelW, sliceTop, pageHeight);
}

function resolveOverlapping(regions, pageHeight) {
  regions.sort((a, b) => a.y - b.y);

  // top down
  for (let i = 1; i < regions.length; i++) {
    const prev = regions[i - 1];
    const curr = regions[i];
    const minY = prev.y + prev.height + SPACING;

    if (curr.y - curr.height < minY) {
      curr.y = minY;
    }
  }

  /* ----------  clamp boxes that run past the bottom, shifting upward if needed ---------- */
  for (let i = regions.length - 1; i >= 0; i--) {
    let curr = regions[i];
    const overflow = curr.y + curr.height + BOTTOM_MARGIN - pageHeight;

    if (overflow > 0) {
      curr.y -= overflow;

      // shift any earlier boxes up as well if this causes new overlaps
      for (let j = i - 1; j >= 0; j--) {
        const above = regions[j];
        const minY = curr.y - above.height - SPACING;
        if (above.y > minY) {
          above.y = Math.max(TOP_MARGIN, minY);
          curr = above; // continue bubbling up
        } else {
          break;
        }
      }
    }
  }
}

/**
 * Draws feedback boxes and connector lines on a PDF page.
 *
 * @param {jsPDF} pdf - The jsPDF instance to draw on.
 * @param {Object[]} regions - Array of region objects to draw.
 */
function drawBoxes(pdf, regions, panelX, panelW, sliceTop, pageHeight) {
  pdf.setFontSize(FONT_SIZE);

  regions.forEach(({ fb, y, height, color, textLines }) => {
    const [r, g, b] = color;

    pdf.setDrawColor(r, g, b);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(panelX, y, panelW - PADDING, height, "FD");

    pdf.setTextColor(0, 0, 0);
    textLines.forEach((line, i) => {
      pdf.text(line, panelX + PADDING, y + PADDING + FONT_SIZE + i * LINE_HEIGHT);
    });

    // connector line
    if (fb.feedbackPoint) {
      const pt = { x: fb.feedbackPoint.x, y: fb.feedbackPoint.y - sliceTop };
      if (pt.y >= 0 && pt.y <= pageHeight) {
        pdf.setDrawColor(r, g, b);
        pdf.setLineDashPattern([3, 2], 0);
        pdf.line(pt.x, pt.y, panelX, y + height / 2);
        pdf.setLineDashPattern([], 0);
      }
    }
  });
}

function preprocess(feedbacks, sliceTop, panelW, pdf, pageHeight) {
  return feedbacks.map((fb, idx) => {
    const preferredY = (fb.feedbackPoint?.y ?? fb.canvasPosition?.top ?? 0) - sliceTop; // canvas → page space

    const prefix = getPrefix(fb.annotationType);
    const label = `${prefix}${fb.index ?? idx + 1}. ${fb.feedback || "No feedback provided"}`;

    const textLines = splitTextIntoLines(label, panelW - 2 * PADDING, FONT_SIZE, pdf);
    const boxHeight = textLines.length * LINE_HEIGHT + 2 * PADDING;

    return {
      idx,
      fb,
      color: getColor(fb.annotationType),
      textLines,
      height: boxHeight,

      // middle of the box, to be moved if overlap
      y: clamp(preferredY - boxHeight / 2, TOP_MARGIN, pageHeight - BOTTOM_MARGIN - boxHeight),
    };
  });
}

function getColor(type) {
  switch (type) {
    case "spelling_and_handwriting":
    case "spelling":
      return [255, 0, 0];
    case "grammar":
      return [0, 0, 255];
    case "punctuation":
      return [0, 128, 0];
    case "syntax":
      return [200, 128, 0];
    case "improvement":
      return [128, 0, 128];
    default:
      return [100, 100, 100];
  }
}

function getPrefix(type) {
  switch (type) {
    case "spelling_and_handwriting":
    case "spelling":
      return "S";
    case "grammar":
      return "G";
    case "punctuation":
      return "P";
    case "syntax":
      return "SY";
    case "improvement":
      return "I";
    default:
      return "X";
  }
}

/**
 * normalize for better processing, the data(annotations, userAnnotations) is from document
 *
 * @param {Object} annotations
 * @param {Object} userAnnotations
 * @param {_FabricObject[]} canvasObjects
 */
function normalizeAnnotatedGroup(annotations, userAnnotations, canvasObjects) {
  const annoByIdx = new Map(); //index feedback map

  Object.values(annotations || {})
    .flat()
    .forEach((a) => {
      if (a?.index != null) annoByIdx.set(String(a.index), a);
    });
  (userAnnotations || []).forEach((a) => {
    if (a?.index != null) annoByIdx.set(String(a.index), a);
  });

  return canvasObjects
    .filter((obj) => obj.isType("group"))
    .map((group) => {
      // data format of user added annotations, istg the dataUserAnnotation is the stupiest thing ever
      const index = group?.data?.index ?? group?.dataUserAnnotation?.userAnnotationIndex;
      const matched = annoByIdx.get(String(index)) || {};

      let feedbackPoint = { x: group.left || 0, y: group.top || 0 };
      const line = group.getObjects().find((o) => o.type === "line");
      if (line) {
        const matrix = line.calcTransformMatrix();
        const localPoint = new Point({ x: line.width / 2, y: -line.height / 2 });
        feedbackPoint = localPoint.transform(matrix);
      }

      return {
        index: index ?? "unknown",
        feedback: matched.feedback || "No feedback provided",
        annotationType: matched.error_type || matched.errorType || "unknown",
        fabricObject: group,
        feedbackPoint,
        canvasPosition: {
          top: group.top || 0,
          left: group.left || 0,
          width: group.width || 0,
          height: group.height || 0,
        },
      };
    });
}

/**
 * Exports the current Fabric.js canvas as a multi-page PDF with feedback annotations.
 * @param {_StaticCanvas} canvas - The fabric canvas
 * @param {Object} annotations - annotations object
 * @param {Object[]} userAnnotations
 * @return {Promise<jsPDF>} - the pdf object
 */
async function exportCanvasWithSideErrors(canvas, annotations, userAnnotations) {
  const defaultHeight = DOCUMENT.HEIGHT;
  const canvasWidth = canvas.getWidth();
  const canvasHeight = canvas.getHeight();
  const totalPages = Math.ceil(canvasHeight / defaultHeight);

  const fullDataURL = canvas.toDataURL({ format: "jpeg", quality: 1.0 });
  const fullImage = await loadImage(fullDataURL);

  const pdfWidth = canvasWidth * PDF_SCALE_FACTOR;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [pdfWidth, defaultHeight],
  });
  const allObjects = canvas.getObjects();

  const feedbackObjects = normalizeAnnotatedGroup(annotations, userAnnotations, allObjects);
  const annotationsByPage = groupAnnotationsByPage(feedbackObjects, defaultHeight);

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage();

    const sliceTop = page * defaultHeight;
    const sliceHeight = Math.min(defaultHeight, canvasHeight - sliceTop);

    // use node canvas
    const sliceCanvas = createCanvas(canvasWidth, sliceHeight);
    const ctx = sliceCanvas.getContext("2d");

    ctx.fillStyle = "#ffffff"; // white background
    ctx.fillRect(0, 0, canvasWidth, sliceHeight);
    ctx.drawImage(
      fullImage,
      0, // src x
      sliceTop, // src y
      canvasWidth, // src w
      sliceHeight, // src h
      0, // dest x
      0, // dest y
      canvasWidth, // dest w
      sliceHeight // dest h
    );

    // add temporary slice bitmap to PDF
    const sliceURL = sliceCanvas.toDataURL("image/jpeg", 1.0);
    pdf.addImage(sliceURL, "JPEG", 0, 0, canvasWidth, sliceHeight);

    // vertical divider
    pdf.setDrawColor(180, 180, 180);
    pdf.line(canvasWidth + 2, 0, canvasWidth + 2, sliceHeight);

    const pageNotes = annotationsByPage[page] || [];
    if (pageNotes.length) {
      drawFeedbackPanelFromCanvas(pdf, pdfWidth, sliceHeight, pageNotes, sliceTop);
    }
  }
  return pdf;
}

/**
 * Export the canvas as a pdf without side errors, the difference of this function and
 * `exportCanvasWithSideErrors` is that this width is different
 *
 * @param {_StaticCanvas} canvas
 * @returns {Promise<jsPDF>} the pdf object
 */
async function exportCanvasWithoutSideErrors(canvas) {
  const defaultHeight = DOCUMENT.HEIGHT;
  const canvasWidth = canvas.getWidth();
  const canvasHeight = canvas.getHeight();
  const totalPages = Math.ceil(canvasHeight / defaultHeight);

  const fullDataURL = canvas.toDataURL({ format: "jpeg", quality: 1.0 });
  const fullImage = await loadImage(fullDataURL);

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [canvasWidth, defaultHeight],
  });

  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    if (pageNum > 0) pdf.addPage();

    const sliceTop = pageNum * defaultHeight;
    const sliceHeight = Math.min(defaultHeight, canvasHeight - sliceTop);

    const sliceCanvas = createCanvas(canvasWidth, sliceHeight);

    const ctx = sliceCanvas.getContext("2d");

    // white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasWidth, sliceHeight);

    // Draw the slice from the full canvas image
    ctx.drawImage(
      fullImage, // source image (full canvas)
      0, // source x
      sliceTop, // source y (where to start slicing)
      canvasWidth, // source width
      sliceHeight, // source height (how much to slice)
      0, // destination x
      0, // destination y
      canvasWidth, // destination width
      sliceHeight // destination height
    );

    // Convert this slice to image data and the slice to PDF
    const sliceDataURL = sliceCanvas.toDataURL("image/jpeg", 1.0);
    pdf.addImage(sliceDataURL, "JPEG", 0, 0, canvasWidth, sliceHeight);
  }
  return pdf;
}

/**
 * Exports the Fabric.js canvas as a PDF, optionally including side error annotations.
 *
 * If `includeFeedback` is `true`, both `annotations` and `userAnnotations` must be provided
 * to include side error boxes in the output PDF.
 *
 * @param {fabric.Canvas} canvas - The Fabric.js canvas representing the current state.
 * @param {Object} annotations - The annotations object, likely from `document.annotations`.
 * @param {Object[]} userAnnotations - The user-provided annotations, likely from `document.userAnnotations`.
 * @param {boolean} includeFeedback - Whether to include side error feedback in the exported PDF.
 * @returns {Promise<jsPDF>} A Promise that resolves to a jsPDF instance, which can be sent to the backend.
 */
async function exportCanvas(
  canvas,
  annotations = {},
  userAnnotations = [],
  includeFeedback = true
) {
  if (includeFeedback && annotations !== null && userAnnotations !== null) {
    return exportCanvasWithSideErrors(canvas, annotations, userAnnotations);
  }
  return exportCanvasWithoutSideErrors(canvas);
}

module.exports = { exportCanvas };
