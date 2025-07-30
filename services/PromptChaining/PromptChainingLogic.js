const { checkEssayError, removeDuplicateError } = require("./ErrorCheckerPrompt.js");
const { getEssayImprovements } = require("./ImprovementPrompt.js");
const { mapFeedbackToOcrPositions } = require("./MappingErrorsPrompt.js");
const logger = require("../../utils/logger.js")("PromptChainingLogic");
const fs = require("fs");
const path = require("path");

const openaiApiKey = process.env.OPENAI_API_KEY;
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: openaiApiKey });

/**
 * Clean the JSON string and extract only the content inside ```json ... ``` code blocks.
 * If no code blocks are found, try to clean the string directly.
 * @param {String} jsonString The string to be cleaned, which may or may not be wrapped in markdown code blocks
 * @returns {String} The cleaned JSON string that can be directly parsed by JSON.parse
 */
function cleanJsonString(jsonString) {
  const jsonBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    return jsonBlockMatch[1].trim();
  } else {
    return jsonString
      .trim()
      .replace(/^(?:\s*\n)+/, "") // remove all leading blank lines
      .replace(/(?:\n\s*)+$/, "") // remove all trailing blank lines
      .replace(/,\s*([}\]])/g, "$1"); // remove any trailing commas before } or ]
  }
}

async function _runPrompt(prompt) {
  const GoogleGenAI = await import("@google/genai").then((pack) => pack.GoogleGenAI);
  const geminiAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY });
  const modelConfig = {
    model: "gemini-2.5-pro-preview-05-06",
    temperature: 0.1,
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
    logger.info(
      `One step done, this step used tokens: ${response?.usageMetadata?.totalTokenCount || 0}`
    );
    return response.text;
  } catch (error) {
    logger.warn(`Gemini failed, falling back to OpenAI: ${error.message}`);
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
async function getResponseFromAi(extractedText, descriptionGroup) {
  // Prepare prompts
  extractedText = extractedText.replace(/ {2,}/g, " ");
  const errorPrompt = checkEssayError(extractedText);

  try {
    // Stage 1: error detection
    let cleanedError = await _runPrompt(errorPrompt);
    cleanedError = cleanJsonString(cleanedError);
    storeAiLog("error", cleanedError);

    // Stage 2: deduplication
    let cleanedDedup = await _runPrompt(removeDuplicateError(extractedText, cleanedError));
    cleanedDedup = cleanJsonString(cleanedDedup);
    storeAiLog("dedup", cleanedDedup);

    // Stage 3: improvements
    let cleanedImp = await _runPrompt(getEssayImprovements(extractedText, cleanedDedup));
    cleanedImp = cleanJsonString(cleanedImp);
    storeAiLog("improvement", cleanedImp);

    // stage 3.5: concat improvement and error
    const errorArray = JSON.parse(cleanedError);
    const improvementArray = JSON.parse(cleanedImp);
    const concatArray = [...errorArray, ...improvementArray];
    const concatString = JSON.stringify(concatArray);
    storeAiLog("improvementAndError", concatString);

    // Stage 4: map feedback
    const finalRaw = await _runPrompt(mapFeedbackToOcrPositions(concatString, descriptionGroup));
    storeAiLog("mapping", finalRaw);
    storeAiLog("extracted", extractedText);
    storeAiLog("description", descriptionGroup);
    return cleanJsonString(finalRaw);
  } catch (err) {
    logger.error("Both Gemini and OpenAI failed:", err);
    return "";
  }
}

/**
 * Stores AI response content into a log file with a timestamp.
 *
 * @param {string} stage - The stage name (e.g., "error", "dedup", "improvement", etc.).
 * @param {string} content - The content string to store.
 */
function storeAiLog(stage, content) {
  const logDir = path.join(__dirname, "../../C:/tmp/prompts");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${stage}_${timestamp}.log`;
  const filepath = path.join(logDir, filename);

  fs.mkdirSync(logDir, { recursive: true });

  try {
    fs.writeFileSync(filepath, content, "utf-8");
    logger.info(`Logged ${stage} response to ${filename}`);
  } catch (err) {
    logger.error(`Failed to write ${stage} log:`, err.message);
  }
}

module.exports = { getResponseFromAi };
