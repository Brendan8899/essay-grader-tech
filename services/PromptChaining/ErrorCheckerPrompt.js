// eslint-disable no-useless-escape
/**
 *
 * @param {any} extractedText The essay text to be checked for errors.
 * @returns {string} A JSON string wrapped in a markdown code block listing all detected errors.
 */
const checkEssayError = (extractedText) => {
  return `
Act as a highly skilled English teacher carefully reviewing this AI-transcribed handwritten essay. Identify all errors, including subtle ones often missed, while accounting for possible spacing or line break issues from AI transcription. Use UK English spelling conventions only.

Error categories (use these exact lowercase values):
- "spelling": Incorrectly spelled words
- "grammar": Subject-verb agreement, verb tense, pronouns, articles, singular/plural forms, etc.
- "punctuation": Issues with capitalization, commas, full stops, apostrophes, spacing, and more

Expected output:
A JSON array listing all identified errors. Each entry must include:

- feedback_type: One of the categories above
- feedback_context: The full sentence containing the error
- underline: The exact word(s) or phrase with the error
- feedback: A simple correction with a brief explanation understandable to children aged 7 to 12 (max 18 words). Avoid complex vocabulary.

Example error entries:

{
  "feedback_type": "grammar",
  "feedback_context": "Tears streamed her face, as she sat at a bench",
  "underline": "Tears streamed her face",
  "feedback": "Missing a preposition: 'Tears streamed down her face' is correct."
},
{
  "feedback_type": "spelling",
  "feedback_context": "She heard a terrible rumor spreading around the class.",
  "underline": "rumor",
  "feedback": "In UK English, spell 'rumor' as 'rumour'."
},
{
  "feedback_type": "punctuation",
  "feedback_context": "Turns out the packets of powder was drugs that",
  "underline": "Turns out the packets",
  "feedback": "Add a comma after 'Turns out': 'Turns out, the packets...'"
},

Guidelines:
- Use essay context to determine if something is an error; some words are errors only in context.
- Ignore crossed-out words (like ~~word~~); treat them as if absent.
- Focus solely on errors; do not provide positive feedback.
- Identify every error, no matter how small.
- Escape all quotation marks inside word arrays with backslashes: \\"example\\".
- Always use lowercase for feedback_type.
- Ensure no spelling, grammar, or punctuation errors are missed.
- Return only the JSON array inside a markdown code block; no extra text.

Notes:
- Refer to full stops as “full stop,” not “period” or “dot.”
- Do not give feedback on spacing before/after commas due to handwriting variability.

Essay:
${extractedText}
  `;
};

/**
 * Creates a prompt to validate and remove duplicate or incorrect feedback based on the original essay.
 *
 * @param {string} extractedText - The original essay content.
 * @param {string} JSONString - JSON string containing feedback entries to check.
 * @returns {string} A formatted prompt for an AI model to verify and deduplicate feedback.
 */
const removeDuplicateError = (extractedText, JSONString) => {
  return `
You have two inputs:
- A plain text essay.
- A JSON array of feedback items about the essay.

Each feedback includes:
- feedback_type: Issue category (spelling, grammar, punctuation).
- feedback_context: Sentence from the essay containing the issue.
- underline: Specific word(s) or phrase flagged.
- feedback: Explanation of the issue.

Tasks:
1. Validate Each Feedback
- Carefully read the essay to understand its meaning.
- Verify if each reported issue truly exists.
- Remove feedback if the problem is not actually present, even if sentence and underline match.
- Keep only accurate and valid feedback.

2. Remove Duplicate or Overlapping Feedback
- Identify feedback items referring to the same error.
- Retain the clearest or most detailed feedback.
- Do not remove feedback about different issues even if contexts overlap.

Output:
Return only the cleaned JSON array wrapped in a markdown code block. Do not include comments or explanations.

Essay:
${extractedText}

Feedback JSON array:
${JSONString}
  `;
};

module.exports = { checkEssayError, removeDuplicateError };
