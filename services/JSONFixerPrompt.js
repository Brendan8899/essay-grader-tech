const JSONFixerPrompt = (faultyJsonString) => {
  return `
I have a string that is intended to be in JSON format, but it contains some punctuation and structural errors such as missing brackets, braces, commas, or quotation marks. Please correct these errors to produce valid JSON String. Fix the issues to ensure that it can be JSON.parse(). Use the Code Interpreter.

Only return the JSON String and nothing else.

Here is the string to correct:

${faultyJsonString}
`;
};

module.exports = JSONFixerPrompt;
