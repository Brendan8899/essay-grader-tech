// eslint-disable no-useless-escape
/**
 * Builds a prompt to map identified errors to exact OCR lines and format them as structured JSON.
 *
 * @param {string} errorsAndImprovementsIdentified - JSON string of detected errors and improvements.
 * @param {string} inputData - OCR text with line numbers and original formatting.
 * @returns {string} A formatted prompt string for the AI to produce a mapped JSON output.
 */
const mapFeedbackToOcrPositions = (errorsAndImprovementsIdentified, inputData) => {
  return `
     You are an ALGORITHM in the middle of a processing pipeline. You will map identified errors to exact OCR text and output ONLY VALID JSON. RETURN a JSON array in a markdown code block

I'll provide you with:
1. The original OCR text with line numbers
2. JSON list of errors from previous steps

Your task:
Convert each JSON entry to the new format by:
1. Changing "feedback_type" to "error_type" (keeping the same value)
2. Creating a "lines" array with line numbers and exact OCR words
3. Map each "underline" text to the exact OCR text, don't include other unnecessary word, including all formatting as in the original.
4. Keeping the original "feedback" content unchanged

Rules for mapping:
- Use line numbers exactly as they appear in OCR text
- The "words" array should contain each exact word/punctuation as in OCR
- For errors spanning multiple lines, include multiple line objects
- Preserve all OCR peculiarities (spaces, capitalization, etc.)
- For improvement entries spanning multiple sentences, include all relevant lines

EXAMPLE JSON RESPONSE FORMAT WITH ESCAPED QUOTATION MARKS:
[
{
    "error_type": "spelling", 
    "lines":[
       {
       "line_number": 3,
       "words":[
           "Ones"
       ]
       }
    ],
   "feedback": "Once"  
},
{
     "error_type": "punctuation", 
     "lines":[
        {
        "line_number": 4,
        "words":[ 
            "sign",
            "\\"",
            "No"
        ]
        }
     ],
    "feedback": "sign, \\"No"  
}
]

Original OCR text:
${inputData}

Errors and improvements identified:
${errorsAndImprovementsIdentified}
`;
};

module.exports = { mapFeedbackToOcrPositions };
