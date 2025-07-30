require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();
const mongoose = require("mongoose");
const { fork } = require("child_process");
const os = require("os");
const morgan = require("morgan");

const logger = require("./utils/logger.js")("http");

const googleVisionRouter = require("./router/GoogleVision");
const documentRouter = require("./router/Document");
const documentCanvasRouter = require("./router/DocumentCanvas");
const masterPromptRouter = require("./router/masterPromptRouter");
const dashboardRouter = require("./router/Dashboard");
const emailVerificationRouter = require("./router/EmailVerification");
const questionRouter = require("./router/Question");
const studentRouter = require("./router/Student");
const pdfSplitRouter = require("./router/PdfSplit");
const authRouter = require("./router/auth.js");
const authenticate = require("./middlewares/authenticate.js");
const { createServer } = require("./websocket.js");
const HttpError = require("http-errors");
require("./utils/puppeteerInstance");
require("./cron");

app.use(
  morgan("tiny", {
    stream: { write: logger.http.bind(logger) },
  })
);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(express.static(path.join(__dirname, ".")));
app.use("/api/auth", authRouter);
app.use("/api/GoogleVision", authenticate, googleVisionRouter);
app.use("/api/documents", authenticate, documentRouter);
app.use("/api/masterprompt", authenticate, masterPromptRouter);
app.use("/api/Dashboard", authenticate, dashboardRouter);
app.use("/api/EmailVerify", authenticate, emailVerificationRouter);
app.use("/api/question", authenticate, questionRouter);
app.use("/api/documentCanvas", authenticate, documentCanvasRouter);
app.use("/api/students", authenticate, studentRouter);
app.use("/api/pdfSplit", authenticate, pdfSplitRouter);

app.get("/api/health-check", (_req, res) => {
  return res.status(200).send("Welcome to the API server!");
});

app.use((error, _req, res, _next) => {
  logger.error(error);
  const message = error?.message || "Internal Server Error";
  let statusCode = 500;
  if (HttpError.isHttpError(error)) {
    statusCode = error.statusCode;
  }
  return res.status(statusCode).json({
    success: false,
    message: message,
    error: message,
  });
});

const PORT = process.env.PORT || 4000;

const httpServer = createServer(app);
httpServer.listen(PORT, () => {
  logger.http(`WebSocket and Server on port ${PORT}`);
});

const uri = process.env.MONGODB_DB;

async function connect() {
  try {
    await mongoose.connect(uri, {
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    logger.http("Connected successfully to MongoDB!");
  } catch (error) {
    logger.error(error);
  }
}

connect();

const NUM_WORKERS = Math.max(Math.round(os.cpus().length * (process.env.CPU_RATIO || 0.5)), 1);

for (let i = 0; i < NUM_WORKERS; i++) {
  fork("./services/Worker.js");
}

fork("./services/imageUploader.js");
