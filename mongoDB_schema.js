const mongoose = require("mongoose");

const inputPdfSchema = new mongoose.Schema({
  filename: { type: String },
  pointSystem: { type: String },
  essayType: { type: String },
  grade: { type: String },
  awardPoints: { type: Array },
  customInstructions: { type: String },
  userId: { type: String, required: true },
  imagesPath: { type: String },
  rawImgPath: { type: String },
  labelledDocumentPath: { type: String },
  svgDocumentPath: { type: String },
  originalPdfPath: { type: String },
  feedbackDocumentPath: { type: String },
  annotations: {
    type: Object,
    default: {
      spelling_and_handwriting: [],
      grammar: [],
      punctuation: [],
      syntax: [],
      improvement: [],
    },
  },
  createdAt: { type: Date, default: Date.now },
  processState: {
    type: String,
    enum: ["processing", "processed", "failed", "canceled"],
    default: "processed",
  },
  className: { type: String },
  essayName: { type: String },
  studentName: { type: String },
  extractedStudentName: { type: String },
  nameVerified: { type: Boolean, default: false },
  requiresTeacherReview: { type: Boolean, default: false },
  gptLog: { type: String },
  processedOutputAI: { type: Array },
  userAnnotations: { type: Array, default: [] },
  isModel: { type: Boolean, default: false },
  hashedPdf: { type: String },
  canvasSave: { type: Boolean },
  strengthsAndWeaknesses: {
    type: Object,
    default: { strongAreas: [], weakAreas: [], mostCommonMistakes: [] },
  },
  boundary: {
    type: [Number],
  },
});

const inputQuestionPdfSchema = new mongoose.Schema({
  filePaths: [String],
  userId: { type: String, required: true },
  topic: { type: String },
  instruction: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const counterSchema = new mongoose.Schema({
  seq: { type: Number, default: 0 },
});

const userVerifiedSchema = new mongoose.Schema({
  fullName: { type: String },
  userId: { type: String, unique: true },
  email: { type: String, unique: true },
  paidTier: { type: String },
  creditsLeft: { type: Number },
  verifiedAccount: { type: Boolean },
  createdAt: { type: Date, default: Date.now },
});

const feedbackPreference = new mongoose.Schema({
  userId: { type: String },
  totalScore: { type: Boolean },
  scoreBreakdown: { type: Boolean },
  summary: { type: Boolean },
  feedback: { type: Boolean },
  strength: { type: Boolean },
  weakness: { type: Boolean },
  spellingErrors: { type: Boolean },
  grammarErrors: { type: Boolean },
  improvements: { type: Boolean },
  punctuation: { type: Boolean },
});

const cachedImagesFromDocx = new mongoose.Schema({
  hashID: { type: String },
  base64: { type: Buffer },
});

const inputPdfCanvasSchema = new mongoose.Schema({
  inputPdfID: { type: String, required: true },
  canvasString: { type: String, default: "" },
});

// Student schema for name verification
const studentSchema = new mongoose.Schema({
  studentName: { type: String, required: true },
  className: { type: String, required: true },
  userId: { type: String, required: true }, // Teacher's ID
  createdAt: { type: Date, default: Date.now },
});

// Create index for faster lookups
studentSchema.index({ userId: 1, className: 1, studentName: 1 }, { unique: true });
inputPdfCanvasSchema.index({ inputPdfID: 1 });

// Create models
const InputPdf = mongoose.model("InputPdf", inputPdfSchema);
const InputQuestionPdf = mongoose.model("InputQuestionPdf", inputQuestionPdfSchema);
const Counter = mongoose.model("counterNumber", counterSchema);
const UserVerified = mongoose.model("Users", userVerifiedSchema);
const feedbackPreferences = mongoose.model("feedbackPreference", feedbackPreference);
const cacheImagesFromDocx = mongoose.model("cacheImages", cachedImagesFromDocx);
const InputPdfCanvas = mongoose.model("InputPdfCanvas", inputPdfCanvasSchema);
const Student = mongoose.model("Student", studentSchema);

module.exports = {
  InputPdf,
  InputQuestionPdf,
  Counter,
  UserVerified,
  feedbackPreferences,
  cacheImagesFromDocx,
  InputPdfCanvas,
  Student,
};
