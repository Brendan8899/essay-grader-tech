const express = require("express");
const {
  addStudent,
  getStudentsByClass,
} = require("../services/StudentService");

const studentRouter = express.Router();

studentRouter.get("/class", async (req, res) => {
  const { className } = req.query;

  if (!className) {
    return res.status(400).json({
      success: false,
      message: "Parameter 'className' must be provided",
    });
  }

  try {
    const studentList = await getStudentsByClass(req.user.uid, className);

    return res.status(200).json({
      success: true,
      message: `Found ${studentList.length} student(s) for the given class`,
      students: studentList,
    });
  } catch (err) {
    console.error("Error fetching students for class:", err);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve students at this time",
    });
  }
});

studentRouter.post("/batch", async (req, res) => {
  const { className, students } = req.body;

  // Validate required inputs
  if (!className || !Array.isArray(students)) {
    return res.status(400).json({
      success: false,
      message: "Both className and a valid students array are required",
    });
  }

  const processedResults = [];

  for (const name of students) {
    if (typeof name === "string" && name.trim().length > 0) {
      const addOutcome = await addStudent(req.user.uid, name.trim(), className);
      processedResults.push({
        originalName: name,
        ...addOutcome,
      });
    }
  }

  return res.status(201).json({
    success: true,
    message: "All provided students have been processed",
    results: processedResults,
  });
});

module.exports = studentRouter;
