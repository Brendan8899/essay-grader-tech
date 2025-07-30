const { InputQuestionPdf } = require("../mongoDB_schema");
const logger = require("../utils/logger.js")("Question");

const openaiApiKey = process.env.OPENAI_API_KEY;
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: openaiApiKey,
  dangerouslyAllowBrowser: true,
});

async function getTextFromImages(base64Array) {
  try {
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `
              Process entire question paper for all images in the correct order
              You are a student reading taking an essay exam.

              Your tasks is to analyze the text and return a JSON string that contains the topic and instruction of the essay.

              Requirements
              1. For the extracted instruction, do not modify the extracted texts before sending the response.
              2. If you do not receive any images, just return No Topic and No Instruction instead.
              3. Return a JSON string that contains two keys - 'topic' and 'instruction'.
            `,
          },
        ],
      },
    ];

    for (let i = 0; i < base64Array.length; i++) {
      messages[0].content.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${base64Array[i]}` },
      });
    }
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      max_tokens: 16384,
    });

    logger.info("Tokens used for question generation:");
    logger.info("Input tokens: " + res.usage.prompt_tokens);
    logger.info("Output tokens: " + res.usage.completion_tokens);
    logger.info("Total tokens: " + res.usage.total_tokens);

    return res.choices[0].message.content;
  } catch (error) {
    logger.error(error);
    return "";
  }
}

async function createQuestion(data, googleStoragePaths) {
  const { userId, topic, instruction } = data;

  const inputQuestionPdf = new InputQuestionPdf({
    filePaths: googleStoragePaths,
    userId: userId,
    topic: topic,
    instruction: instruction,
    createdAt: new Date(),
  });
  const newInputQuestionPDF = await inputQuestionPdf.save();
  return newInputQuestionPDF;
}

async function updateQuestion(data, googleStoragePaths, questionDocumentId) {
  const { userId, topic, instruction } = data;

  const updateParameters = {
    filePaths: googleStoragePaths,
    userId: userId,
    topic: topic,
    instruction: instruction,
  };

  const updateQuestionPdf = await InputQuestionPdf.findByIdAndUpdate(
    questionDocumentId,
    updateParameters
  );
  return updateQuestionPdf;
}

function escapeRegExp(string) {
  if (string === undefined) string = "";
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchConditionConstructor(userId, filter = {}) {
  // TODO
  const searchConditions = { userId: userId };
  const escapedSearch = escapeRegExp(filter.search);

  if (escapedSearch) {
    const regex = new RegExp(escapedSearch);
    searchConditions.$or = [{ topic: { $regex: regex, $options: "i" } }];
  }

  if (filter.startDate && filter.endDate) {
    const startDate = new Date(filter.startDate);
    const endDate = new Date(filter.endDate);
    endDate.setHours(23, 59, 59, 999);

    searchConditions.createdAt = {
      $gte: startDate,
      $lte: endDate,
    };
  } else if (filter.startDate) {
    searchConditions.createdAt = { $gte: new Date(filter.startDate) };
  } else if (filter.endDate) {
    const endDate = new Date(filter.endDate);
    endDate.setHours(23, 59, 59, 999);

    searchConditions.createdAt = { $lte: endDate };
  }
  return searchConditions;
}

module.exports = {
  createQuestion,
  getTextFromImages,
  searchConditionConstructor,
  updateQuestion,
};
