const express = require("express");
const masterPromptRouter = express.Router();

const masterPromptTemplate = require("../services/masterPrompt");

masterPromptRouter.get("/master-prompt", (req, res) => {
  const {
    className,
    assignmentName,
    pointSystem,
    grade,
    essayType,
    awardPoints,
    customInstructions,
  } = req.query;
  const prompt = masterPromptTemplate(
    className,
    assignmentName,
    pointSystem,
    grade,
    essayType,
    awardPoints ? awardPoints.split(",") : [],
    customInstructions
  );
  return res.send(prompt.toString());
});

module.exports = masterPromptRouter;
