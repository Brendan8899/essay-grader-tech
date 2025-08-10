const logger = require("../utils/logger.js")("teacherStudentInteraction.js");
const { teacherStudentInteraction } = require("../mongoDB_schema.js");
const { organizeAnnotations } = require("../services/Document.service.js");
const Redis = require("ioredis");
const redisConfig = require("../config").REDIS;
const redisDataClient = new Redis(redisConfig);

async function retrieveStudentTeacherInteraction(teacherId, studentId) {
  const compositeKey = teacherId + ":" + studentId;
  await redisDataClient.del(compositeKey);
  const cachedInteraction = await redisDataClient.lrange(compositeKey, 0, -1);
  if (!cachedInteraction || cachedInteraction.length === 0) {
    //Redis Does Not Contain Teacher Student Interaction
    // Attempt to retrieve interaction from Database
    const retrievedInteraction = await teacherStudentInteraction
      .find({ compositeKey: compositeKey })
      .sort({ createdAt: 1 })
      .limit(5);
    if (
      retrievedInteraction &&
      Array.isArray(retrievedInteraction) &&
      retrievedInteraction.length !== 0
    ) {
      let cacheFormatData = retrievedInteraction.map((interaction) => JSON.stringify(interaction));
      redisDataClient.lpush(compositeKey, ...cacheFormatData);

      return cacheFormatData;
    } else {
      // No Interaction Found in Database and Redis Cache, return null
      return "";
    }
  } else {
    try {
      let processedInteraction = cachedInteraction.join("\n");
      return processedInteraction;
    } catch (error) {
      logger.error("Error Parsing Redis Cached Interaction", error);
      return "";
    }
  }
}

async function createStudentTeacherInteraction(teacherId, studentId, newInteraction, essayId) {
  const compositeKey = teacherId + ":" + studentId;

  for (const key of Object.keys(newInteraction)) {
    newInteraction[key] = newInteraction[key].map((interaction) => ({
      error_type: interaction.error_type,
      words: interaction.words,
      feedback: interaction.feedback,
    }));
  }

  let transformedInteraction = {
    interactions: newInteraction,
  };

  try {
    await teacherStudentInteraction.create({
      teacherId,
      studentId,
      compositeKey,
      interaction: transformedInteraction,
      essayId,
    });
    const interactionString = JSON.stringify(transformedInteraction);
    await redisDataClient.lpush(compositeKey, interactionString);
    redisDataClient.ltrim(compositeKey, -5, -1);
  } catch (error) {
    logger.error(error);
  }
}

async function updateStudentTeacherInteraction(updatedInteraction, essayId) {
  const essayInvolved = await teacherStudentInteraction.findOne({ essayId });
  if (essayInvolved && updatedInteraction.annotations) {
    const compositeKey = essayInvolved.compositeKey;
    await teacherStudentInteraction.updateOne(
      { essayId },
      {
        $set: {
          "interaction.interactions": updatedInteraction,
        },
      }
    );

    await redisDataClient
      .del(compositeKey)
      .catch("Error removing outdated Interaction Information from Redis");

    //Retrieves the most recent 5 graded essay
    const updatedRetrievedInteractions = await teacherStudentInteraction
      .find({ compositeKey })
      .sort({ createdAt: 1 })
      .limit(5);
    //Extract Interaction Object Field and JSON Stringify to store in Redis
    const processedRetrievedInteractions = updatedRetrievedInteractions
      .map((updatedRetrievedInteraction) => updatedRetrievedInteraction.interaction)
      .map((interactionObject) => JSON.stringify(interactionObject));
    redisDataClient.lpush(compositeKey, processedRetrievedInteractions);
  } else if (essayInvolved && updatedInteraction.userAnnotations) {
    const organizedUserAnnotations = organizeAnnotations(updatedInteraction.userAnnotations);
    for (const key of Object.keys(organizedUserAnnotations)) {
      organizedUserAnnotations[key] = organizedUserAnnotations[key].map((interaction) => ({
        error_type: interaction.error_type,
        feedback: interaction.feedback,
      }));
    }

    const compositeKey = essayInvolved.compositeKey;

    await teacherStudentInteraction.updateOne(
      { essayId },
      {
        $set: {
          "interaction.userAnnotations": organizedUserAnnotations,
        },
      }
    );

    await redisDataClient
      .del(compositeKey)
      .catch("Error removing outdated Interaction Information from Redis");

    //Retrieves the most recent 5 graded essay
    const updatedRetrievedInteractions = await teacherStudentInteraction
      .find({ compositeKey })
      .sort({ createdAt: 1 })
      .limit(5);
    //Extract Interaction Object Field and JSON Stringify to store in Redis
    const processedRetrievedInteractions = updatedRetrievedInteractions
      .map((updatedRetrievedInteraction) => updatedRetrievedInteraction.interaction)
      .map((interactionObject) => JSON.stringify(interactionObject));
    redisDataClient.lpush(compositeKey, processedRetrievedInteractions);
  } else {
    logger.info("This Essay does not have Student Teacher Interaction Term!");
  }
}

module.exports = {
  retrieveStudentTeacherInteraction,
  createStudentTeacherInteraction,
  updateStudentTeacherInteraction,
};
