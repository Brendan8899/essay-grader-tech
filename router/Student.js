const express = require("express");
const {
  addStudent,
  getStudentsByClass,
  getClassesByTeacher,
  deleteStudent,
  verifyStudentName,
  updateStudent,
} = require("../services/StudentService");

const studentRouter = express.Router();

/**
 * Add a new student to a class
 */
studentRouter.post("/", async (req, res) => {
  const { studentName, className } = req.body;

  if (!studentName || !className) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: studentName, and className are required",
    });
  }

  const result = await addStudent(req.user.uid, studentName, className);

  if (!result.success) {
    return res.status(409).json(result); // 409 Conflict
  }

  return res.status(201).json(result);
});

/**
 * Get students by class
 */
studentRouter.get("/class", async (req, res) => {
  const { className } = req.query;

  if (!className) {
    return res.status(400).json({
      success: false,
      message: "Missing required parameters: className is required",
    });
  }

  const students = await getStudentsByClass(req.user.uid, className);

  return res.status(200).json({
    success: true,
    message: "Students retrieved successfully",
    students,
  });
});

/**
 * Get all classes for a teacher
 */
studentRouter.get("/classes", async (req, res) => {
  const classes = await getClassesByTeacher(req.user.uid);

  return res.status(200).json({
    success: true,
    message: "Classes retrieved successfully",
    classes,
  });
});

/**
 * Delete a student
 */
studentRouter.delete("/:studentId", async (req, res) => {
  const { studentId } = req.params;

  if (!studentId) {
    return res.status(400).json({
      success: false,
      message: "Missing required parameters: studentId",
    });
  }

  const result = await deleteStudent(req.user.uid, studentId);

  if (!result.success) {
    return res.status(404).json(result);
  }

  return res.status(200).json(result);
});

/**
 * Batch add students
 */
studentRouter.post("/batch", async (req, res) => {
  const { className, students } = req.body;

  if (!className || !Array.isArray(students)) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: className, and students array",
    });
  }

  const results = [];

  for (const studentName of students) {
    if (typeof studentName === "string" && studentName.trim()) {
      const result = await addStudent(req.user.uid, studentName.trim(), className);
      results.push({
        studentName,
        ...result,
      });
    }
  }

  return res.status(201).json({
    success: true,
    message: "Batch student addition completed",
    results,
  });
});

/**
 * Verify a student name against database
 */
studentRouter.post("/verify", async (req, res) => {
  const { studentName, className } = req.body;

  if (!studentName || !className) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: studentName, and className are required",
      verified: false,
      exactMatch: false,
      finalName: studentName || "No Name",
    });
  }

  const verificationResult = await verifyStudentName(req.user.uid, studentName, className);

  // Determine final name to use
  let finalName;

  if (verificationResult.exactMatch) {
    // If exact match found, use the database version (with correct capitalization)
    finalName = verificationResult.student.studentName;
  } else if (studentName.trim() !== "") {
    // If no exact match but we have a name, use the provided name
    finalName = studentName;
  } else {
    // If no name was provided, use "No Name"
    finalName = "No Name";
  }

  return res.status(200).json({
    success: true,
    verified: verificationResult.verified,
    exactMatch: verificationResult.exactMatch,
    similarMatches: verificationResult.similarMatches || [],
    finalName,
    message: verificationResult.message,
  });
});

/**
 * Update a student's name
 */
studentRouter.put("/", async (req, res) => {
  const { studentId, newName, className } = req.body;

  if (!studentId || !newName || !className) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: studentId, newName, and className are required",
    });
  }

  const result = await updateStudent(req.user.uid, studentId, newName, className);

  if (!result.success) {
    return res.status(400).json(result);
  }

  return res.status(200).json(result);
});

module.exports = studentRouter;
