const { checkEssayError, removeDuplicateError } = require("./ErrorCheckerPrompt.js");
const { getEssayImprovements } = require("./ImprovementPrompt.js");
const { generateMappingPrompt } = require("./MappingErrorsPrompt.js");

const openaiApiKey = process.env.OPENAI_API_KEY;
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: openaiApiKey });

/**
 * Extracts and cleans JSON content from a string that may contain markdown code blocks.
 * If the input contains a ```json ... ``` block, returns only the JSON inside that block.
 * Otherwise, trims whitespace and removes trailing commas before closing braces/brackets.
 *
 * @param {string} jsonString - The input string possibly containing JSON with or without markdown code blocks.
 * @returns {string} - A cleaned JSON string suitable for parsing with JSON.parse.
 */
function cleanJsonString(jsonString) {
  const jsonBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    return jsonBlockMatch[1].trim();
  } else {
    return jsonString
      .trim()
      .replace(/^(?:\s*\n)+/, "") // Remove leading empty lines
      .replace(/(?:\n\s*)+$/, "") // Remove trailing empty lines
      .replace(/,\s*([}\]])/g, "$1"); // Remove trailing commas before } or ]
  }
}

async function _runPrompt(prompt) {
  const GoogleGenAI = await import("@google/genai").then((pack) => pack.GoogleGenAI);
  const geminiAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY });
  const modelConfig = {
    model: "gemini-2.5-pro-preview-05-06"
  };

  try {
    // using generate content less crashing
    const response = await geminiAI.models.generateContent({
      model: modelConfig.model,
      contents: prompt,
      config: {
        temperature: modelConfig.temperature,
      },
    });
    return response.text;
  } catch (error) {
    console.warn(`Gemini failed, falling back to OpenAI: ${error.message}`);
  }

  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: prompt,
        },
      ],
    },
  ];
  const res = await openai.chat.completions.create({ model: "chatgpt-4o-latest", messages });
  return res.choices[0].message.content;
}

/**
 * Main logic for prompt chaining: processes extracted text and OCR-formatted data,
 * sending multiple chained prompts to the AI model. Typically completes in 8–10 minutes.
 *
 * @param {string} extractedText - The extracted text from LLM model (gpt-4o-latest)
 * @param {string} descriptionGroup - The OCR-formatted data for LLM to map back the error
 * @returns {Promise<string>} - The final JSON string that can be parsed by JSON.parse
 */
async function getResponseFromAi(extractedText, descriptionGroup, teacherStudentInteraction) {
  // Prepare prompts
  extractedText = extractedText.replace(/ {2,}/g, " ");
  const errorPrompt = checkEssayError(extractedText,  teacherStudentInteraction);

  try {
    // Stage 1: error detection
    let cleanedError = await _runPrompt(errorPrompt);
    cleanedError = cleanJsonString(cleanedError);

    // Stage 2: deduplication
    let cleanedDedup = await _runPrompt(removeDuplicateError(extractedText, cleanedError));

    // Stage 3: improvements
    let cleanedImp = await _runPrompt(getEssayImprovements(extractedText, cleanedDedup));
    cleanedImp = cleanJsonString(cleanedImp);

    // stage 3.5: concat improvement and error
    const errorArray = JSON.parse(cleanedError);
    const improvementArray = JSON.parse(cleanedImp);
    const concatArray = [...errorArray, ...improvementArray];
    const concatString = JSON.stringify(concatArray);

    // Stage 4: map feedback
    const finalRaw = await _runPrompt(generateMappingPrompt(concatString, descriptionGroup));
    return cleanJsonString(finalRaw);
  } catch (err) {
    console.error("Both Gemini and OpenAI failed:", err);
    return "";
  }
}

module.exports = { getResponseFromAi };
