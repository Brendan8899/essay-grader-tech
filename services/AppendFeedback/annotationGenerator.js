const { Group, Line, FabricText } = require("fabric/node");
const DOCUMENT = require("../../config/document.js");
const logger = require("../../utils/logger.js")("AnnotationGenerator");

const STROKE_WIDTH = 4;
const LABEL_FONT_SIZE = 30;
const TYPE_META = {
  spelling_and_handwriting: { prefix: "s", color: "red" },
  grammar: { prefix: "g", color: "blue" },
  punctuation: { prefix: "p", color: "green" },
  improvement: { prefix: "i", color: "purple" },
};

/**
 * Shifts overlapping label text in fabric groups horizontally to avoid collisions.
 *
 * @param {Group[]} fabricGroups - Array of fabric groups containing text objects.
 * @returns {Group[]} Modified fabric groups with adjusted text positions.
 */
function shiftOverlappingTextLabels(fabricGroups) {
  for (let i = 0; i < fabricGroups.length; i++) {
    const groupA = fabricGroups[i];
    const textsA = groupA.getObjects("text");

    for (let j = i + 1; j < fabricGroups.length; j++) {
      const groupB = fabricGroups[j];
      const textsB = groupB.getObjects("text");

      textsA.forEach((textA) => {
        textsB.forEach((textB) => {
          const [aX, aY] = textA.coordinates;
          const [bX, bY] = textB.coordinates;
          const isOverlapping =
            Math.sqrt(Math.pow(aX - bX, 2) + Math.pow(aY - bY, 2)) < LABEL_FONT_SIZE;

          if (isOverlapping) {
            const newX = textB.left + 1.5 * LABEL_FONT_SIZE;
            textB.set("left", newX);
          }
        });
      });
    }
  }

  return fabricGroups;
}

/**
 * Shifts overlapping underline lines in fabric groups vertically to avoid collisions.
 *
 * @param {Group[]} fabricGroups - Array of fabric groups containing line objects.
 * @returns {Group[]} Modified fabric groups with adjusted underline positions.
 */
function shiftOverlappingCoordinates(fabricGroups) {
  const THRESHOLD = 5;
  const Y_OFFSET = 7;

  fabricGroups.sort((a, b) => a.top - b.top || a.left - b.left); //top -> bottom, left -> right

  for (let i = 0; i < fabricGroups.length; i++) {
    const groupA = fabricGroups[i];
    const linesA = groupA.getObjects("line");

    for (let j = i + 1; j < fabricGroups.length; j++) {
      const groupB = fabricGroups[j];
      const linesB = groupB.getObjects("line");

      linesA.forEach((lineA) => {
        linesB.forEach((lineB) => {
          const { x1: ax1, x2: ax2, y1: ay1, y2: ay2 } = lineA;
          const { x1: bx1, x2: bx2, y1: by1, y2: by2 } = lineB;
          const isSameYLevel = Math.abs(ay1 - by1) < THRESHOLD && Math.abs(ay2 - by2) < THRESHOLD;
          const aMinX = Math.min(ax1, ax2);
          const aMaxX = Math.max(ax1, ax2);
          const bMinX = Math.min(bx1, bx2);
          const bMaxX = Math.max(bx1, bx2);

          const isOverlappingX = aMinX <= bMaxX && bMinX <= aMaxX;

          if (isSameYLevel && isOverlappingX) {
            groupB.remove(lineB);
            // the x1, x2, y1, y2 is not related to new coordinate system, I guess only top control the position
            const line = new Line([bx1, by1, bx2, by2], {
              stroke: lineB.stroke || "black",
              strokeWidth: STROKE_WIDTH,
              left: bx1,
              top: by1 + Y_OFFSET,
            });
            groupB.add(line);
          }
        });
      });
    }
  }

  return fabricGroups;
}

function getAdjustedCoordinates(coords, page) {
  if (!Array.isArray(coords)) return [];
  return coords.map((coord) => ({ ...coord, y: coord.y + page * DOCUMENT.HEIGHT }));
}

/**
 * Creates underlines based on given word-box coordinates.
 *
 * @param {Object} annotation - Annotation containing multi-line word-box coordinates and page.
 * @param {string} color - Color of the underline stroke.
 * @returns {Line[]} Array of fabric Line objects.
 */
function createUnderlinesFromCoordinates(annotation, color = "black") {
  const { coordinates, page } = annotation;
  const underlines = [];

  if (!Array.isArray(coordinates)) {
    logger.warn("Invalid coordinates: not an array");
    return underlines;
  }

  const adjustedCoordinates = coordinates.map((line) =>
    line.map((box) => getAdjustedCoordinates(box, page))
  );
  for (const line of adjustedCoordinates) {
    if (!Array.isArray(line) || line.length === 0) continue;

    const validBoxes = line.filter((box) => Array.isArray(box) && box.length === 4);

    if (validBoxes.length === 0) continue;

    // Sort boxes by x of top-left point
    validBoxes.sort((a, b) => a[0].x - b[0].x);

    const firstBox = validBoxes[0];
    const lastBox = validBoxes[validBoxes.length - 1];
    const lowestY = Math.max(
      ...firstBox.map((point) => point.y),
      ...lastBox.map((point) => point.y)
    );
    const underline = new Line(
      [
        firstBox[3].x,
        lowestY, // bottom-left of first word
        lastBox[2].x,
        lowestY, // bottom-right of last word
      ],
      {
        stroke: color,
        strokeWidth: STROKE_WIDTH,
      }
    );

    underlines.push(underline);
  }

  return underlines;
}

function getPreviousVersionUnderlines(
  firstWordCoordinate,
  lastWordCoordinate,
  lines,
  color = "black"
) {
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const underline = new Line(
      [
        firstWordCoordinate[3].x,
        firstWordCoordinate[3].y,
        lastWordCoordinate[2].x,
        firstWordCoordinate[3].y,
      ],
      {
        stroke: color,
        strokeWidth: STROKE_WIDTH,
      }
    );
    result.push(underline);
  }
  return result;
}

function generateAnnotation(annotation, type, isPreviousVersion) {
  const { index, uniqueId, page } = annotation;
  const meta = TYPE_META[type];
  if (!meta) {
    logger.warn(`Unknown annotation type: ${type}`);
    return null;
  }

  /* coordinates previously was for spelling annotation only, now it is all of the underline words,
  retrieving the first word of the first line give us backward compatibility */
  const firstCoordsRaw = annotation.firstWordCoordinates || annotation.coordinates;
  const lastCoordsRaw = annotation.lastWordCoordinates || annotation.coordinates;

  const firstCoords = getAdjustedCoordinates(firstCoordsRaw, page);
  const lastCoords = getAdjustedCoordinates(lastCoordsRaw, page);

  if (firstCoords.length < 4 || lastCoords.length < 4) {
    logger.warn(`Invalid coordinates for ${type} annotation`);
    return null;
  }

  const labelX = Math.min(...firstCoords.map((c) => c.x));
  const labelY = Math.min(...firstCoords.map((c) => c.y));

  const label = new FabricText(`${meta.prefix}${index}`, {
    left: labelX,
    top: labelY,
    originY: "bottom",
    fontSize: LABEL_FONT_SIZE,
    fontWeight: "bold",
    fill: meta.color,
    coordinates: [labelX, labelY], // for comparing the text afterwards
  });

  const underlines = isPreviousVersion
    ? getPreviousVersionUnderlines(firstCoords, lastCoords, annotation.lines, meta.color)
    : createUnderlinesFromCoordinates(annotation, meta.color);
  const objects = [label, ...underlines];

  return new Group(objects, {
    selectable: true,
    data: { uniqueId, annotationType: type, index },
  });
}

// Create a function to process all annotations
const createAnnotations = (annotations, isPreviousVersion = false) => {
  const fabricObjects = [];
  Object.keys(TYPE_META).forEach((type) => {
    if (annotations[type]) {
      annotations[type].forEach((annotation) => {
        const group = generateAnnotation(annotation, type, isPreviousVersion);
        if (group) fabricObjects.push(group);
      });
    }
  });
  if (isPreviousVersion) {
    return fabricObjects;
  }
  const shiftedObjects = shiftOverlappingTextLabels(shiftOverlappingCoordinates(fabricObjects));
  return shiftedObjects;
};

module.exports = {
  createAnnotations,
};
