const JSONFixerPrompt = require("./JSONFixerPrompt.js");
const Queue = require("bull");
const OpenAI = require("openai");
const redisConfig = require("../config").REDIS;
const logger = require("../utils/logger.js")("JSONFormatter");

// Initialize OpenAI with your API key
const openaiApiKey = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

// Initialize a Bull queue
const myQueue = new Queue("JSONFixerQueue", {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

function isValidJSON(str) {
  try {
    JSON.parse(str);
    return true;
  } catch (_e) {
    return false;
  }
}

// Function to enqueue invalid JSON strings
async function fixIfInvalid(jsonString) {
  if (!isValidJSON(jsonString)) {
    const fixedJSON = await myQueue.add({ string: jsonString });
    return fixedJSON;
  } else {
    return jsonString;
  }
}

myQueue.process(async (job) => {
  const { string: malformedJSON } = job.data;

  try {
    // Generate the prompt using JSONFixerPrompt
    const prompt = JSONFixerPrompt(malformedJSON);
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

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      max_tokens: 16384,
    });

    // Log token usage
    logger.info("Tokens used for JSON fixing:");
    logger.info("Input tokens: " + res.usage.prompt_tokens);
    logger.info("Output tokens: " + res.usage.completion_tokens);
    logger.info("Total tokens: " + res.usage.total_tokens);

    // Extract the fixed JSON from the response
    const fixedJSON = res.choices[0].message.content;

    // Log the input and output JSON for debugging
    logger.info(
      "Original malformed JSON (first 100 chars): " + malformedJSON.substring(0, 100) + "..."
    );
    logger.info("Fixed JSON result (first 100 chars): " + fixedJSON.substring(0, 100) + "...");

    // Validate the fixed JSON
    if (isValidJSON(fixedJSON)) {
      return fixedJSON;
    } else {
      throw new Error("Fixed JSON is invalid");
    }
  } catch (error) {
    logger.error(`Error processing job ${job.id}:`, error);
    throw error;
  }
});

// Handle job completion
myQueue.on("completed", (job, result) => {
  logger.info(`Job ${job.id} completed with result: ${result}`);
});

myQueue.on("failed", (job, err) => {
  if (job.attemptsMade < job.opts.attempts) {
    logger.info(
      `Job ${job.id} failed. Attempt ${job.attemptsMade} of ${job.opts.attempts}. Reason: ${err.message}`
    );
  } else {
    logger.info(`Job ${job.id} failed after ${job.attemptsMade} attempts. Reason: ${err.message}`);
  }
});

module.exports = { fixIfInvalid };
