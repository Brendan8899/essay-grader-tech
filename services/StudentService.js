const { Student } = require("../mongoDB_schema");

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
    console.error("Error adding student:", error);
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
    console.error("Error getting students by class:", error);
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
    console.error("Error getting classes by teacher:", error);
    throw error;
  }
}

/**
 * Calculate the similarity between two strings based on Levenshtein distance.
 * Returns a value between 0 (completely different) and 1 (identical).
 * 
 * @param {string} str1 - First string to compare
 * @param {string} str2 - Second string to compare
 * @returns {number} - Similarity score between 0 and 1
 */
function stringSimilarity(str1, str2) {
  const a = str1.toLowerCase().trim();
  const b = str2.toLowerCase().trim();

  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  if (a === b) return 1;

  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);

  return (maxLen - distance) / maxLen;
}

/**
 * Compute Levenshtein distance between two strings.
 * 
 * @param {string} s1 
 * @param {string} s2 
 * @returns {number}
 */
function levenshteinDistance(s1, s2) {
  const len1 = s1.length;
  const len2 = s2.length;
  const dp = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) dp[i][0] = i;
  for (let j = 0; j <= len2; j++) dp[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return dp[len1][len2];
}


/**
 * Attempts to confirm the identity of a student within a teacher's class records.
 *
 * @param {string} teacherId - The unique identifier of the teacher.
 * @param {string} targetName - The student name to verify.
 * @param {string} classGroup - The class or group name to search within.
 * @returns {Promise<Object>} - An object summarizing verification results.
 */
async function verifyStudentName(teacherId, targetName, classGroup) {
  try {
    // Return early if no student name is provided
    if (!targetName) {
      return {
        isVerified: false,
        isExactMatch: false,
        infoMessage: "Student name was not specified",
        closeMatches: [],
      };
    }

    // Search for an exact match, ignoring case differences
    const exactStudentRecord = await Student.findOne({
      userId: teacherId,
      className: classGroup,
      studentName: { $regex: new RegExp(`^${targetName}$`, "i") },
    });

    if (exactStudentRecord) {
      return {
        isVerified: true,
        isExactMatch: true,
        infoMessage: "Exact student name matched",
        studentData: exactStudentRecord,
        closeMatches: [],
      };
    }

    // If exact match not found, fetch all students in the class to find close matches
    const studentsInClass = await Student.find({
      userId: teacherId,
      className: classGroup,
    });

    // Evaluate similarity scores for each student name compared to the target name
    const candidates = studentsInClass
      .map((student) => {
        const dbName = student.studentName;
        const similarityValue = stringSimilarity(dbName, targetName);

        return {
          ...student.toObject(),
          similarityScore: similarityValue,
        };
      })
      .filter((candidate) => candidate.similarityScore > 0.7) // Only consider candidates with high similarity
      .sort((a, b) => b.similarityScore - a.similarityScore); // Sort descending by similarity score

    return {
      isVerified: candidates.length > 0,
      isExactMatch: false,
      infoMessage: candidates.length > 0 ? "Potential name matches found" : "No similar student names detected",
      closeMatches: candidates,
    };
  } catch (err) {
    console.error("Student name verification error:", err);
    throw err;
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
    console.error("Error updating student:", error);
    throw error;
  }
}

module.exports = {
  addStudent,
  getStudentsByClass,
  getClassesByTeacher,
  verifyStudentName,
  updateStudent,
};
