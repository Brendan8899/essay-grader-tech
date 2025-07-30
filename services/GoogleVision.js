const logger = require("../utils/logger.js")("GoogleVisionService");

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

/**
 * Utility function to normalize words by removing punctuation and converting to lowercase.
 * @param {string} word - The word to normalize.
 * @returns {string} - The normalized word.
 */
function normalizeWord(word) {
  return word
    .replace(/[^\w\s]|_/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Finds the index of the word in matchingSentence that best matches firstWord.
 * @param {string} firstWord - The word to match against.
 * @param {string[]} matchingSentence - An array of words to search.
 * @returns {number} - The index of the best matching word. Returns -1 if the array is empty or invalid.
 */
function fuzzyfind(firstWord, matchingSentence) {
  if (!Array.isArray(matchingSentence) || matchingSentence.length === 0) {
    return -1;
  }

  let bestMatchIndex = -1;
  let highestSimilarity = -1;

  // Normalize the firstWord once to avoid repeated processing
  const normalizedFirstWord = normalizeWord(firstWord);

  for (let i = 0; i < matchingSentence.length; i++) {
    const currentWord = matchingSentence[i];
    const normalizedCurrentWord = normalizeWord(currentWord);

    // Calculate Levenshtein distance
    const distance = levenshteinDistance(normalizedFirstWord, normalizedCurrentWord);
    const maxLength = Math.max(normalizedFirstWord.length, normalizedCurrentWord.length);

    // Handle case where both words are empty after normalization
    if (maxLength === 0) {
      continue;
    }

    const similarity = 1 - distance / maxLength;

    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      bestMatchIndex = i;
    }
  }
  return bestMatchIndex;
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
    logger.error("Error parsing JSON string:", error);
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
 * Calculates the minimum and maximum x-coordinates from a 3D array of vertices.
 *
 * @param {Array<Array<Array<{x: number, y: number}>>>} coordinatesMap - A 3D array representing lines of words,
 * each word being an array of vertex objects with x and y properties.
 * @returns {[number, number]} An array containing the minimum and maximum x-coordinates.
 */
function getBoundaryX(coordinatesMap) {
  const xs = coordinatesMap.flatMap((line) => line.flatMap((vertice) => vertice.map((v) => v.x)));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  return [minX, maxX];
}

/**
 * @typedef {Array<[{x: number, y: number}, {x: number, y: number}, {x: number, y: number}, {x: number, y: number}]>} vertices
 * Groups OCR word boxes into lines based on vertical alignment and sorts them left to right.
 * This function uses adaptive thresholding based on word height and median line gap.
 * @param {Array<[{x: number, y: number}, {x: number, y: number}, {x: number, y: number}, {x: number, y: number}, {description: string}]>} processingArray -
 * Array of OCR word boxes with four bounding vertices and a description.
 * @returns {[string[][], vertices[][]]} A 2D array where each sub-array is a line of text (words in reading order).
 */
function rearrangeText(processingArray) {
  const IGNORE_EDGE_LINES = 4; // trim header or footer noise
  const GAP_FACTOR = 0.4;
  const words = preprocess(processingArray);
  const LINE_THRESHOLD = median(words.map((w) => w.height));

  // Pass 1 – roughly bucket centre-Ys to figure out overall line spacing
  words.sort((a, b) => a.centerY - b.centerY);

  const roughLines = [];
  for (const w of words) {
    const last = roughLines[roughLines.length - 1];
    if (last && Math.abs(last.avgY - w.centerY) <= LINE_THRESHOLD) {
      last.totalY += w.centerY;
      last.count += 1;
      last.avgY = last.totalY / last.count;
    } else {
      roughLines.push({ totalY: w.centerY, count: 1, avgY: w.centerY });
    }
  }

  // Calculate a *robust* (median) gap across the middle of the page
  const usableYs = roughLines
    .slice(IGNORE_EDGE_LINES, -IGNORE_EDGE_LINES || undefined)
    .map((l) => l.avgY);

  const roughGaps = usableYs.slice(1).map((y, i) => y - usableYs[i]);
  const medianGap = roughGaps.length ? median(roughGaps) : LINE_THRESHOLD * 2;

  // Helper → line-membership tolerance adapts to word height
  const tolerance = (h) => Math.max(h, medianGap * GAP_FACTOR);

  // Pass 2 – final, using adaptive tolerance
  const finalLines = [];
  for (const w of words) {
    const last = finalLines[finalLines.length - 1];
    if (last && Math.abs(last.avgY - w.centerY) <= tolerance(w.height)) {
      last.words.push(w);
      last.avgY = (last.avgY * (last.words.length - 1) + w.centerY) / last.words.length;
    } else {
      finalLines.push({ avgY: w.centerY, words: [w] });
    }
  }

  const sentences = finalLines.map((line) =>
    line.words.sort((a, b) => a.minX - b.minX).map((w) => w.description)
  );
  const coordinatesMap = finalLines.map((line) =>
    line.words.sort((a, b) => a.minX - b.minX).map((w) => w.coordinates)
  );

  return [sentences, coordinatesMap];
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 *
 * @param {Array<[ {x: number, y: number}, {x: number, y: number}, {x: number, y: number}, {x: number, y: number}, {description: string} ]>} processingArray
 * @returns
 */
function preprocess(processingArray) {
  return processingArray.map((word) => {
    const ys = word.slice(0, 4).map((p) => p.y);
    const xs = word.slice(0, 4).map((p) => p.x);
    return {
      centerY: (Math.min(...ys) + Math.max(...ys)) / 2,
      minX: Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      description: word[4].description,
      coordinates: word.slice(0, 4),
    };
  });
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
    logger.error("Invalid input types for getAnnotation");
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
    logger.error("invalid input!");
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
  getBoundaryX,
  rearrangeText,
  generateDescriptionLines,
  findLineInPage,
  fuzzyfind,
  parseJSONString,
};
