// eslint-disable no-useless-escape
/**
 * Constructs a prompt instructing an AI to link detected errors to their exact positions within OCR text,
 * returning the result as a structured JSON array in a markdown code block.
 *
 * @param {string} detectedIssuesJson - JSON string listing errors and suggested improvements.
 * @param {string} ocrTextWithLines - The OCR output text, including line numbers and formatting.
 * @returns {string} A prompt string formatted for an AI to produce a JSON mapping of errors to OCR text locations.
 */
const generateMappingPrompt = (detectedIssuesJson, ocrTextWithLines) => {
  return `
    You are a processing module that links error data to precise OCR text locations. 
    Your output must be strictly valid JSON formatted as a markdown code block.

    Input Provided:
    1. The original OCR text with corresponding line numbers.
    2. A JSON array containing identified errors and improvement suggestions.

    Your task is to transform each error record as follows:
    - Rename the property "feedback_type" to "error_type" while retaining its value.
    - Create a "lines" array where each element includes:
       - "line_number": the exact line number from the OCR.
       - "words": an array of words and punctuation exactly as they appear on that line in the OCR, preserving spacing and formatting.
    - Match each "underline" phrase precisely to the OCR text without adding or omitting words or formatting.
    - Leave the original "feedback" text unchanged.

    Mapping Requirements:
    - Use line numbers exactly as shown in the OCR.
    - The "words" array should reflect the exact sequence of tokens (words, punctuation, spacing) from the OCR text.
    - For errors spanning multiple lines, include all relevant lines in order.
    - Maintain all OCR formatting quirks, including capitalization, spacing, and punctuation.
    - When improvements span multiple sentences or lines, include all pertinent lines.

    EXAMPLE OF EXPECTED JSON FORMAT (with escaped quotes):

    [
      {
        "error_type": "spelling",
        "lines": [
          {
            "line_number": 3,
            "words": ["Ones"]
          }
        ],
        "feedback": "Once"
      },
      {
        "error_type": "punctuation",
        "lines": [
          {
            "line_number": 4,
            "words": ["sign", "\\\"", "No"]
          }
        ],
        "feedback": "sign, \\\"No"
      }
    ]

    OCR Text Provided:
    ${ocrTextWithLines}

    Errors and improvements detected:
    ${detectedIssuesJson}
  `;
};

module.exports = { generateMappingPrompt };
