// eslint-disable no-useless-escape
/**
 *
 * @param {any} extractedText the text to be checked for errors
 * @returns {String} the response of the AI, which is a JSON string, in markdown code block
 */
//TODO: implement syntax and content error in backend, database and frontend
const checkEssayError = (extractedText) => {
  return `
Act as an expert English teacher and review this AI-transcribed handwritten essay with meticulous attention to detail. Identify ALL errors especially minor ones typically overlooked, but also considering it was already transcribed by AI so it may have spacing or line break issue. Follow UK English spelling standards, not US English.

feedback_type: Categorize as one of:
- "spelling": Any misspelled words
- "grammar": Subject-verb agreement, tense, verb forms, pronouns, articles, plural-singular errors, etc.
- "punctuation": Capitalization, commas, periods, apostrophes, spacing, etc.

You should return all the errors you identified in JSON format with these fields:
Output: A list of errors in JSON format that includes:

feedback_type: Categorize as "spelling", "grammar", "punctuation"
feedback_context: Include the full sentence containing the error
underline: Specify the exact word(s) or phrase that contains the error
feedback: Provide the correction plus a concise but COMPREHENSIBLE (to a student aged 7 - 12). Do not use advanced words to explain, i.e superlative, possessive form, etc. when explaining as 7-12 year old students have limited vocabulary and do not understand these words) explanation in one sentence, following the feedback format(18 words maximum)
example of one error for each feedback_type:

{
    "feedback_type": "grammar",
    "feedback_context": "Tears streamed her face, as she sat at a bench",
    "underline": "Tears streamed her face",
    "feedback": "The phrase 'Tears streamed her face' is missing a preposition. It should be 'Tears streamed down her face'."
},
{
  "feedback_type": "spelling",
  "feedback_context": "She heard a terrible rumor spreading around the class.",
  "underline": "rumor",
  "feedback": "In UK English, 'rumor' is spelled 'rumour'."
},
{
    "feedback_type": "punctuation",
    "feedback_context": "Turns out the packets of powder was drugs that",
    "underline": "Turns out the packets",
    "feedback": "There should be a comma after 'Turns out' – 'Turns out, the packets of powder...'"
},


Important Notes:
- You must understand the context of the essay and use those contexts to identify each error. Some errors are not errors on their own, but in that sentence it’s an error.
- If a word is crossed out, eg. ~~word~~, treat the word as not being there and do not include it in the feedback.
- Do not give any feedback on what the essay has done well and focus only on the errors.
- Do not overlook any errors, regardless of how minor they may seem. Be thorough and exhaustive in your analysis, treating this as if you were grading for a high-stakes English proficiency exam.
- All QUOTATION MARKS within word arrays MUST be escaped with BACKSLASH like: "\\"Line of text...\\""
- ALWAYS USE LOWERCASE FOR FEEDBACK_TYPE VALUES. For example, use "spelling" not "Spelling".
- ENSURE ALL SPELLING, GRAMMAR, AND PUNCTUATION ERRORS ARE IDENTIFIED. ESPECIALLY FOR SPELLING, ENSURE THAT NO SPELLING ERRORS ARE MISSED OUT.
- ONLY RETURN a JSON array in a markdown code block. NO COMMENTS OR DESCRIPTIONS

Special Notes:
- When referring to punctuation marks, use “full stop” instead of “period” or “dot.”
- Ignore any feedback about spacing errors before/after commas due to the handwritten nature of the essay.


Here's the essay: 
    ${extractedText}
    `;
};

/**
 * Generates a prompt to validate and deduplicate AI-generated feedback against the original essay.
 *
 * @param {string} extractedText - The plain text of the original essay to validate feedback against.
 * @param {string} JSONString - A stringified JSON array containing feedback items to be checked.
 * @returns {string} - A formatted prompt string ready to be sent to an AI model for validation and cleanup.
 */
const removeDuplicateError = (extractedText, JSONString) => {
  return `
You are given two inputs:
An essay in plain text.
A JSON array containing feedback items on the essay.
Each feedback item includes:
feedback_type: The type of issue (spelling, grammar, punctuation).
feedback_context: The full sentence from the essay containing the issue.
underline: The specific word or phrase flagged.
feedback: The explanation of the issue.

Your Tasks:
1. Meaningful Feedback Validation
Read the essay carefully to understand the full meaning of the content.
For each feedback item:
Check if the feedback makes sense based on the essay content.
Remove the feedback if the identified issue does not actually exist, even if the sentence and underline appear to match.
Keep the feedback only if the issue is truly valid according to the essay’s context.
2. Redundant or Overlapping Feedback Cleanup
Identify redundant or overlapping feedbacks by checking if:
Two or more feedback items are about the same issue or error.
One feedback is more general or already covers the other.
Keep the clearest or largest meaningful feedback, and remove the unnecessary duplicates.
Do not remove feedback that discusses different issues, even if the contexts overlap.

Output Format:
Return only the final JSON array wrapped in a Markdown code block.
Do not include any comments, explanations, or extra text.

Here is the essay:
    ${extractedText}
Here is the JSON array:
	${JSONString}
	`;
};
module.exports = { checkEssayError, removeDuplicateError };
