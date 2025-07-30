const masterPrompt = require("./masterPrompt");
const logger = require("../utils/logger.js")("OpenAI");

const openaiApiKey = process.env.OPENAI_API_KEY;
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: openaiApiKey,
});
const { encodeToBase64 } = require("../utils/encodeToBase64");
const textExtractionPrompt = require("./textExtractionPrompt");
const { strengthAndWeaknessPrompt } = require("./strengthAndWeaknessPrompt");

const getFormattedDate = () => {
  const date = new Date();
  return date.toISOString().replace(/:/g, "-").replace(/\..+/, "");
};

async function getQuestionImagesFromStorage(filePathArray) {
  const host = `${process.env.GOOGLE_STORAGE_BUCKET}/${process.env.GOOGLE_STORAGE_BUCKET_UPLOADED_QUESTIONS}`;

  const imageUrls = filePathArray.map((filePath) => {
    const imageURL = host + "/" + filePath;
    return imageURL;
  });

  return imageUrls;
}

async function getAIResponseWithImages(extractedText, data, questionChoice, questionFileURL) {
  try {
    const {
      className = "",
      assignmentName = "",
      pointSystem = "",
      grade = "",
      essayType = "",
      awardPoints = [],
      customInstructions = "",
    } = data;

    const questionInstruction =
      questionChoice == null || questionChoice.instruction == null
        ? null
        : questionChoice.instruction;

    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: masterPrompt(
              className,
              assignmentName,
              pointSystem,
              grade,
              essayType,
              awardPoints,
              customInstructions,
              extractedText,
              questionInstruction
            ),
          },
        ],
      },
    ];

    for (let i = 0; i < questionFileURL.length; i++) {
      // 1. Get the entire array of base64 images
      const base64Images = await encodeToBase64(questionFileURL[i], questionChoice._id);

      // 2. Safely check if it is indeed an array
      if (!Array.isArray(base64Images)) {
        logger.error("encodeToBase64 did not return an array");
        continue;
      }

      // 3. Use a for-of loop to iterate over each base64 string in the array
      for (const base64Image of base64Images) {
        messages[0].content.push({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${base64Image}`,
          },
        });
      }
    }

    const res = await openai.chat.completions.create({
      model: "chatgpt-4o-latest",
      messages: messages,
      max_tokens: 16384,
    });

    return res.choices[0].message.content;
  } catch (error) {
    logger.error(error);
    return "";
  }
}

async function getTextFromImages(base64Array) {
  try {
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: textExtractionPrompt,
          },
        ],
      },
    ];
    //Loop Through imageUrl array
    for (let i = 0; i < base64Array.length; i++) {
      messages[0].content.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${base64Array[i]}` },
      });
    }
    // Now make the OpenAI request after all images have been added
    const res = await openai.chat.completions.create({
      model: "chatgpt-4o-latest",
      messages: messages,
      max_completion_tokens: 16384,
    });
    return res.choices[0].message.content;
  } catch (error) {
    logger.error(error);
    return ""; // Return an empty string in case of error to handle gracefully
  }
}

function addErrors(data, errors) {
  const joinOriginalText = (lines) => {
    return lines.reduce((acc, cur) => acc + " " + cur.words.join(" "), "").trim();
  };

  const groupings = [
    {
      label: "Spelling Errors and Unclear Handwriting",
      types: ["spelling", "unclear_handwriting"],
    },
    {
      label: "Grammar and Sentence Structure",
      types: ["grammar", "syntax"],
    },
    {
      label: "Improvements",
      types: ["improvement"],
    },
    {
      label: "Punctuation",
      types: ["punctuation"],
    },
  ];

  let overallResult = "";

  groupings.forEach(({ label, types }) => {
    const groupStr = errors
      .filter((err) => types.includes(err.error_type))
      .reduce((acc, cur) => {
        const originalText = joinOriginalText(cur?.lines);
        return (
          acc +
          `<br> - Index: ${cur.index}<br> - Original: "${originalText}"<br> - Feedback: "${cur.feedback}"<br>`
        );
      }, "");

    data.push([label, groupStr]);
    overallResult += groupStr + "<br>";
  });

  data.push(["Errors", overallResult.trim()]);

  return data;
}

function processOutput(gptResponse) {
  const lines = gptResponse.split("\n");
  let outputTuples = [];

  // Regular expression to identify lines that match the pattern (key: value)
  const tuplePattern = /\(([^:]+): (.+)\)/;

  lines.forEach((line) => {
    const match = line.match(tuplePattern);

    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove unnecessary spaces and form the tuple
      outputTuples.push([key, value]);
    }
  });

  //TODO: remove this after my intern
  const REDUCE_MARKS = (string, marks) => {
    const num = parseInt(string);
    return Math.max(0, num - marks);
  };
  outputTuples[0][1] = REDUCE_MARKS(outputTuples[0][1], 2 * 3);
  outputTuples[1][1] = REDUCE_MARKS(outputTuples[1][1], 3);
  outputTuples[2][1] = REDUCE_MARKS(outputTuples[2][1], 3);

  return outputTuples;
}

async function classifyStrengthAndWeakness(feedback) {
  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: strengthAndWeaknessPrompt(feedback),
        },
      ],
    },
  ];
  const res = await openai.chat.completions.create({
    model: "chatgpt-4o-latest",
    messages: messages,
    max_completion_tokens: 16384,
    response_format: { type: "json_object" },
  });
  logger.info("Tokens used for classify strength and weakness:");
  logger.info("Input tokens: " + res.usage.prompt_tokens);
  logger.info("Output tokens: " + res.usage.completion_tokens);
  logger.info("Total tokens: " + res.usage.total_tokens);
  return res.choices[0].message.content;
}

module.exports = {
  getFormattedDate,
  getAIResponseWithImages,
  processOutput,
  addErrors,
  getTextFromImages,
  getQuestionImagesFromStorage,
  classifyStrengthAndWeakness,
};
