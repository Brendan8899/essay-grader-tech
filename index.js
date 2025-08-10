require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();
const mongoose = require("mongoose");
const { fork } = require("child_process");
const os = require("os");
const googleVisionRouter = require("./router/GoogleVision");
const documentRouter = require("./router/Document");
const questionRouter = require("./router/Question");
const studentRouter = require("./router/Student");
const pdfSplitRouter = require("./router/PdfSplit");
const { createServer } = require("./websocket.js");
const HttpError = require("http-errors");
require("./utils/puppeteerInstance");

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(express.static(path.join(__dirname, ".")));
app.use("/api/GoogleVision", googleVisionRouter);
app.use("/api/documents", documentRouter);
app.use("/api/question", questionRouter);
app.use("/api/students", studentRouter);
app.use("/api/pdfSplit", pdfSplitRouter);

app.use((error, _req, res, _next) => {
  console.error(error);
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
  console.log(`WebSocket and Server on port ${PORT}`);
});

const uri = process.env.MONGODB_DB;

async function connect() {
  try {
    await mongoose.connect(uri, {
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    console.log("Connected successfully to MongoDB!");
  } catch (error) {
    console.error(error);
  }
}

connect();

const NUM_WORKERS = Math.max(Math.round(os.cpus().length * (process.env.CPU_RATIO || 0.5)), 1);

for (let i = 0; i < NUM_WORKERS; i++) {
  fork("./services/Worker.js");
}