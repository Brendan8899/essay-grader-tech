
/**
 * Joins groups of sentences into a formatted string with line indices.
 * For presenting AI line references when mapping back errors
 * @param {string[][]} allSentences
 * @returns {string}
 */
function generateDescriptionLines(allSentences) {
  return allSentences
    .map((line, index) => {
      return `${index}. ${line.join(" ")}`;
    })
    .join("\n");
}

function findPage(lineNumber, pageLines) {
  let accumulatedLines = 0;

  for (let i = 0; i < pageLines.length; i++) {
    accumulatedLines += pageLines[i];

    // If the line number is less than or equal to the current cumulative total, return the page number
    // Minus One because Line Number starts from 0
    if (lineNumber <= accumulatedLines - 1) {
      return i;
    }
  }

  return -1; // If line number exceeds the total number of lines
}

function findLineInPage(pages, lineNumber) {
  let cumulativeLines = 0;

  for (let i = 0; i < pages.length; i++) {
    const previousCumulative = cumulativeLines;
    cumulativeLines += pages[i];

    if (lineNumber < cumulativeLines) {
      // Line number in the current page (0-based)
      return lineNumber - previousCumulative;
    }
  }

  return -1; // If the line number exceeds the total lines
}

// TODO: make the parsing more robust, find page more robust, the extracted text may be useful for find page
// eslint-disable-next-line no-unused-vars
function parseJSONString(checkerResponseStr, extractedText, pageTotalLines) {
  try {
    const processedJSON = JSON.parse(checkerResponseStr)
      .filter((prop) => Array.isArray(prop?.lines) && prop.lines.length > 0)
      .sort((a, b) => {
        const lineNumberA = a.lines?.[0]?.line_number ?? 0;
        const lineNumberB = b.lines?.[0]?.line_number ?? 0;

        return lineNumberA - lineNumberB;
      })
      .map((prop, index) => {
        const words = prop.lines.flatMap((line) => line.words);

        const lineNumber = prop.lines?.[0]?.line_number ?? 0;

        prop.page = findPage(lineNumber, pageTotalLines);
        prop.index = index;
        prop.words = words;
        return prop;
      });
    return processedJSON;
  } catch (error) {
    console.error("Error parsing JSON string:", error);
    return [];
  }
}

/**
 * Extracts bounding polygon vertices for each detected word (excluding the full text block).
 *
 * @param {protos.google.cloud.vision.v1.IAnnotateImageResponse} result
 * - `result.textAnnotations[0]` contains the full text string; each subsequent entry is an individual word or phrase with bounding box.
 * @returns {Array<Array<{x: number, y: number}> & {description: string}>}
 * - Returns an array where each item is an array of 4 vertices plus a description:
 *   [{x, y}, {x, y}, {x, y}, {x, y}, {description: "word"}]
 */
function getBoundingPolyVertices(result) {
  return result.textAnnotations
    .slice(1)
    .map((data) => [...data.boundingPoly.vertices, { description: data.description }]);
}

/**
 * Computes the minimum and maximum x-coordinates from a 3D array of vertex objects.
 *
 * @param {Array<Array<Array<{x: number, y: number}>>>} coords3D - Nested array of lines, words, and vertices.
 * @returns {[number, number]} Array with [minX, maxX].
 */
function computeXBounds(coords3D) {
  let minX = Infinity;
  let maxX = -Infinity;

  for (const line of coords3D) {
    for (const word of line) {
      for (const vertex of word) {
        if (vertex.x < minX) minX = vertex.x;
        if (vertex.x > maxX) maxX = vertex.x;
      }
    }
  }

  return [minX, maxX];
}

function rearrangeText(processingArray) {
  let three_d_Array = [];
  const coordinate_map = new Map();

  processingArray.sort((a, b) => a[0].y - b[0].y);

  let currentGroup = [];
  for (let i = 0; i < processingArray.length; i++) {
    if (currentGroup.length === 0) {
      currentGroup.push([processingArray[i]]);
    } else {
      // Check the y difference between the current item and the previous item in the group
      const firstItemInGroup = currentGroup[currentGroup.length - 1];
      if (
        Math.abs(processingArray[i][0].y + processingArray[i][2].y) / 2 -
          Math.abs(firstItemInGroup[0][0].y + firstItemInGroup[0][2].y) / 2 <=
        13
      ) {
        currentGroup.push([processingArray[i]]);
      } else {
        // Otherwise, push the current group to the three_d_Array and start a new group
        three_d_Array.push(currentGroup);
        currentGroup = [[processingArray[i]]]; // Start a new group with the current item
      }
    }
  }

  //Push the last group if it's not empty
  if (currentGroup.length > 0) {
    three_d_Array.push(currentGroup);
  }

  three_d_Array.forEach((group) => group.sort((a, b) => a[0][0].x - b[0][0].x));

  const descriptionGroups = three_d_Array.map((group) =>
    group.map((array) => array[0].find((word) => word.description)?.description)
  );

  for (let i = 0; i < three_d_Array.length; i++) {
    for (let j = 0; j < three_d_Array[i].length; j++) {
      const wordArray = three_d_Array[i][j];

      const vertices = [];

      for (let k = 0; k < 4; k++) {
        const vertex = wordArray[0][k];
        vertices.push({ x: vertex.x, y: vertex.y });
      }

      // Store the vertices in the map using (i, j) as the key
      coordinate_map.set(JSON.stringify([i, j]), vertices);
    }
  }
  return [descriptionGroups, coordinate_map];
}

/**
 * Maps AI error feedback to annotation coordinates for visual rendering.
 *
 * @param {Array<Object>} aiResponse - Array of AI-generated error objects
 * @param {string[][]} sentences - 2D array of sentence words
 * @param {Array<Array<Array<{x: number, y: number}>>>} coordinatesMap - Coordinates for each word in each line
 * @returns {Array<Object>} Annotations containing coordinate info for underlining or highlighting
 */
function getAnnotation(aiResponse, sentences, coordinatesMap) {
  if (!Array.isArray(aiResponse) || !Array.isArray(sentences) || !Array.isArray(coordinatesMap)) {
    console.error("Invalid input types for getAnnotation");
    return [];
  }
  const temp = aiResponse.map((error) => {
    const coordinates = extractUnderlineCoordinates(error, sentences, coordinatesMap);
    //can enhance by searching the other line number
    return {
      ...error,
      coordinates,
      firstWordCoordinates: Array.isArray(coordinates[0]) ? coordinates[0].at(0) || [] : [],
      lastWordCoordinates: Array.isArray(coordinates.at(-1)) ? coordinates.at(-1).at(-1) || [] : [],
    };
  });
  return temp;
}

/**
 * @typedef {Object} ErrorLine
 * @property {number} line_number - The index of the line in the text
 * @property {string[]} words - Array of words in that line
 */

/**
 * @typedef {Object} AIError
 * @property {string} error_type - The type of error (e.g., "grammar", "punctuation")
 * @property {ErrorLine[]} lines - The affected lines with their words
 * @property {string} feedback - Feedback describing the error
 */

/**
 *
 * @param {AIError} error
 * @param {string[][]} sentences
 * @param {Array<Array<Array<{x: number, y: number}>>>} coordinatesMap
 * @returns {Array<Object>}
 */
function extractUnderlineCoordinates(error, sentences, coordinatesMap) {
  const len = error.lines.length;
  return error.lines.map((line, index) => {
    if (line.line_number >= sentences.length || line.line_number >= coordinatesMap.length) {
      return [];
    }
    const sentence = sentences[line.line_number];
    const coordinate = coordinatesMap[line.line_number];
    const [start, end] = getBestMatch(line.words, sentence, index < len - 1);
    if (start != -1 && end != -1 && start >= 0 && end < coordinate.length) {
      return coordinate.slice(start, end + 1);
    } else {
      return [];
    }
  });
}

/**
 * Gets the best matching substring in `sentence` for the given `target`.
 *
 * @param {string[]} target - The target sequence of words to match.
 * @param {string[]} sentence - The full sentence broken into an array of words.
 * @returns {[number, number]} - The start and end indices (inclusive) of the best match in `sentence`.
 */
function getBestMatch(target, sentence, hasNextLine = false) {
  let smallestDistance = Infinity;
  let start = -1;
  let end = -1;

  if (sentence.length < target.length) {
    console.error("invalid input!");
    return [start, end];
  }

  const ERROR = 4;
  const completeSentence = target.join(" ");
  for (let i = 0; i < ERROR; i++) {
    const len = target.length + i;
    for (let j = 0; j <= sentence.length - len; j++) {
      const segment = sentence.slice(j, j + len).join(" ");
      const distance = levenshteinDistance(completeSentence, segment);
      if (distance < smallestDistance || (hasNextLine && distance <= smallestDistance)) {
        start = j;
        end = j + len - 1;
        smallestDistance = distance;
      }
    }
  }
  return [start, end];
}

/**
 * Calculates the Levenshtein distance between two strings.
 * @param {string} a - The first string.
 * @param {string} b - The second string.
 * @returns {number} - The Levenshtein distance.
 */
function levenshteinDistance(a, b) {
  const normalizedA = a.toLowerCase();
  const normalizedB = b.toLowerCase();
  const matrix = [];

  // Initialize the first row and column of the matrix
  for (let i = 0; i <= normalizedB.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= normalizedA.length; j++) {
    matrix[0][j] = j;
  }

  // Populate the matrix with distances
  for (let i = 1; i <= normalizedB.length; i++) {
    for (let j = 1; j <= normalizedA.length; j++) {
      if (normalizedB.charAt(i - 1) === normalizedA.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // Deletion
          matrix[i][j - 1] + 1, // Insertion
          matrix[i - 1][j - 1] + 1 // Substitution
        );
      }
    }
  }

  return matrix[normalizedB.length][normalizedA.length];
}

module.exports = {
  getAnnotation,
  getBoundingPolyVertices,
  computeXBounds,
  rearrangeText,
  generateDescriptionLines,
  findLineInPage,
  parseJSONString,
};
