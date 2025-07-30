const { Student } = require("../mongoDB_schema");
const logger = require("../utils/logger.js")("StudentService");

/**
 * Add a new student to the database
 * @param {string} userId - Teacher's user ID
 * @param {string} studentName - Student's name
 * @param {string} className - Class name
 * @returns {Promise<Object>} - Created student document
 */
async function addStudent(userId, studentName, className) {
  try {
    // Check if student already exists
    const existingStudent = await Student.findOne({
      userId,
      className,
      studentName: { $regex: new RegExp(`^${studentName}$`, "i") }, // Case-insensitive match
    });

    if (existingStudent) {
      return {
        success: false,
        message: "Student already exists in this class",
        student: existingStudent,
      };
    }

    // Create new student
    const newStudent = new Student({
      userId,
      studentName,
      className,
      createdAt: new Date(),
    });

    const savedStudent = await newStudent.save();

    return {
      success: true,
      message: "Student added successfully",
      student: savedStudent,
    };
  } catch (error) {
    logger.error("Error adding student:", error);
    throw error;
  }
}

/**
 * Get all students for a specific class
 * @param {string} userId - Teacher's user ID
 * @param {string} className - Class name
 * @returns {Promise<Array>} - List of students
 */
async function getStudentsByClass(userId, className) {
  try {
    return await Student.find({ userId, className })
      .sort({ studentName: 1 }) // Sort alphabetically
      .lean(); // Convert to plain JavaScript objects
  } catch (error) {
    logger.error("Error getting students by class:", error);
    throw error;
  }
}

/**
 * Get all classes for a teacher
 * @param {string} userId - Teacher's user ID
 * @returns {Promise<Array>} - List of class names
 */
async function getClassesByTeacher(userId) {
  try {
    const classes = await Student.distinct("className", { userId });
    return classes;
  } catch (error) {
    logger.error("Error getting classes by teacher:", error);
    throw error;
  }
}

/**
 * Delete a student
 * @param {string} userId - Teacher's user ID
 * @param {string} studentId - Student document ID
 * @returns {Promise<Object>} - Result of deletion
 */
async function deleteStudent(userId, studentId) {
  try {
    const result = await Student.findOneAndDelete({
      _id: studentId,
      userId, // Ensure teacher can only delete their own students
    });

    if (!result) {
      return {
        success: false,
        message: "Student not found or you don't have permission to delete",
      };
    }

    return {
      success: true,
      message: "Student deleted successfully",
    };
  } catch (error) {
    logger.error("Error deleting student:", error);
    throw error;
  }
}

/**
 * Compute similarity score between two strings
 * @param {string} str1 - First string to compare
 * @param {string} str2 - Second string to compare
 * @returns {number} - Similarity score between 0 and 1
 */
function stringSimilarity(str1, str2) {
  // Normalize strings for comparison
  const a = str1.toLowerCase().trim();
  const b = str2.toLowerCase().trim();

  // If either string is empty, return 0
  if (!a.length || !b.length) return 0;

  // If strings are identical, return 1
  if (a === b) return 1;

  // Check if one string contains the other
  if (a.includes(b) || b.includes(a)) {
    // Calculate containment score based on the ratio of the shorter string to the longer string
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    return (shorter.length / longer.length) * 0.9; // Scale to 90% max for containment only
  }

  // Simple Levenshtein-inspired similarity score for more complex fuzzy matching
  // Count matching characters
  let matches = 0;
  const minLength = Math.min(a.length, b.length);

  // Check character matches position by position
  for (let i = 0; i < minLength; i++) {
    if (a[i] === b[i]) matches++;
  }

  // Split into words and check for word matches (better for names)
  const aWords = a.split(/\s+/);
  const bWords = b.split(/\s+/);

  let wordMatches = 0;
  for (const aWord of aWords) {
    if (aWord.length < 2) continue; // Skip very short words

    for (const bWord of bWords) {
      if (bWord.length < 2) continue;

      // Check for exact word match or significant partial match
      if (
        aWord === bWord ||
        (aWord.length > 3 && bWord.length > 3 && (aWord.includes(bWord) || bWord.includes(aWord)))
      ) {
        wordMatches++;
        break;
      }
    }
  }

  // Calculate final similarity score, giving higher weight to word matches
  const charSimilarity = matches / Math.max(a.length, b.length);
  const wordSimilarity = wordMatches / Math.max(aWords.length, bWords.length);

  // Weighted combination - word matches are more important for names
  return charSimilarity * 0.4 + wordSimilarity * 0.6;
}

/**
 * Verify a student name against the database
 * @param {string} userId - Teacher's user ID
 * @param {string} studentName - Student name to verify
 * @param {string} className - Class name
 * @returns {Promise<Object>} - Verification result
 */
async function verifyStudentName(userId, studentName, className) {
  try {
    if (!studentName) {
      return {
        verified: false,
        exactMatch: false,
        message: "No student name provided",
        similarMatches: [],
      };
    }

    // Check for exact match (case-insensitive)
    const exactMatch = await Student.findOne({
      userId,
      className,
      studentName: { $regex: new RegExp(`^${studentName}$`, "i") },
    });

    if (exactMatch) {
      return {
        verified: true,
        exactMatch: true,
        message: "Student name verified",
        student: exactMatch,
        similarMatches: [],
      };
    }

    // If no exact match, look for similar names
    const allStudents = await Student.find({
      userId,
      className,
    });

    // Filter and sort for similar matches using improved algorithm
    const similarMatches = allStudents
      .map((student) => {
        const dbName = student.studentName;
        const inputName = studentName;

        // Calculate similarity score
        const similarity = stringSimilarity(dbName, inputName);

        // Add similarity score to student object
        return {
          ...student.toObject(),
          similarityScore: similarity,
        };
      })
      .filter((student) => student.similarityScore > 0.5) // Only include reasonably similar matches (50%+)
      .sort((a, b) => b.similarityScore - a.similarityScore); // Sort by similarity (highest first)

    return {
      verified: similarMatches.length > 0,
      exactMatch: false,
      message:
        similarMatches.length > 0 ? "Similar student names found" : "No matching student found",
      similarMatches,
    };
  } catch (error) {
    logger.error("Error verifying student name:", error);
    throw error;
  }
}

/**
 * Update a student's name
 * @param {string} userId - Teacher's user ID
 * @param {string} studentId - Student's ID
 * @param {string} newName - New student name
 * @param {string} className - Class name
 * @returns {Promise<Object>} - Updated student document
 */
async function updateStudent(userId, studentId, newName, className) {
  try {
    // Check if student with the same name already exists in the class
    const existingStudent = await Student.findOne({
      userId,
      className,
      studentName: { $regex: new RegExp(`^${newName}$`, "i") }, // Case-insensitive match
      _id: { $ne: studentId }, // Exclude the current student
    });

    if (existingStudent) {
      return {
        success: false,
        message: "Another student with this name already exists in this class",
      };
    }

    // Update the student
    const updatedStudent = await Student.findOneAndUpdate(
      { _id: studentId, userId }, // Ensure teacher can only update their own students
      { $set: { studentName: newName } },
      { new: true } // Return the updated document
    );

    if (!updatedStudent) {
      return {
        success: false,
        message: "Student not found or you don't have permission to update",
      };
    }

    return {
      success: true,
      message: "Student updated successfully",
      student: updatedStudent,
    };
  } catch (error) {
    logger.error("Error updating student:", error);
    throw error;
  }
}

module.exports = {
  addStudent,
  getStudentsByClass,
  getClassesByTeacher,
  deleteStudent,
  verifyStudentName,
  updateStudent,
};
