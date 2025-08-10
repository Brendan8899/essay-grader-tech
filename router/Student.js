const express = require("express");
const {
  addStudent,
  getStudentsByClass,
  updateStudent,
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



studentRouter.put("/", async (req, res) => {
  const { studentId, newName, className } = req.body;

  if (!studentId || !newName || !className) {
    return res.status(400).json({
      success: false,
      message: "Required information missing: studentId, newName, and className must be provided",
    });
  }

  try {
    // Attempt student update
    const updateOutcome = await updateStudent(req.user.uid, studentId, newName, className);

    if (!updateOutcome.success) {
      return res.status(400).json(updateOutcome);
    }

    return res.status(200).json(updateOutcome);
  } catch (err) {
    console.error("Error updating student record:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while updating the student",
    });
  }
});


module.exports = studentRouter;
