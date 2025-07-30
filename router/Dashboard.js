const express = require("express");
const { InputPdf } = require("../mongoDB_schema");

const dashboardRouter = express.Router();

dashboardRouter.get("/marksEssayGraded", async (req, res) => {
  // Using essayName as the assignment name
  const documents = await InputPdf.find({ userId: req.user.uid })
    .sort({ createdAt: -1 }) // Sort by the most recent
    .limit(10) // Limit to the most recent 10 assignments
    .exec();

  // Calculate average score for each assignment
  const assignmentScores = documents.reduce((acc, doc) => {
    const totalScoreEntry = doc.processedOutputAI.find((entry) => entry[0] === "Total Score");
    const totalScore = totalScoreEntry ?? parseFloat(totalScoreEntry[1]);

    if (totalScore !== null) {
      // Using essayName as the assignment name
      const assignmentName = doc.essayName || `No Essay Name`; // Use essayName if available

      if (!acc[assignmentName]) {
        acc[assignmentName] = { total: 0, count: 0 };
      }

      acc[assignmentName].total += totalScore;
      acc[assignmentName].count += 1;
    }

    return acc;
  }, {});

  // Calculate average score for each assignment
  const averageScores = Object.keys(assignmentScores).map((assignmentName) => ({
    assignmentName,
    averageScore: (
      assignmentScores[assignmentName].total / assignmentScores[assignmentName].count
    ).toFixed(2),
  }));

  return res.status(200).json(averageScores);
});

dashboardRouter.get("/numberEssayGraded", async (req, res) => {
  const documents = await InputPdf.find({ userId: req.user.uid }).exec();

  // Group by date and count the number of documents
  const countByDate = documents.reduce((acc, doc) => {
    const date = doc.createdAt.toISOString().split("T")[0]; // Extract date part
    if (!acc[date]) {
      acc[date] = 0;
    }
    acc[date]++;
    return acc;
  }, {});

  return res.status(200).json(countByDate);
});

module.exports = dashboardRouter;
