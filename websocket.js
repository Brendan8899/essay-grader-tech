const http = require("http");
const { Server } = require("socket.io");
const logger = require("./utils/logger.js")("WebSocket");
const Redis = require("ioredis");
const redisConfig = require("./config").REDIS;
const redis = new Redis(redisConfig);
const redisDataClient = new Redis(redisConfig);

let ioInstance;

const sendByUserId = async (userId, eventName, message) => {
  const socketId = await redisDataClient.get(userId);
  if (!socketId) {
    logger.warn(`No socket found for userId: ${userId}`);
    return;
  }
  await ioInstance?.to(socketId).emit(eventName, message);
};

const createServer = (app) => {
  if (ioInstance) {
    return ioInstance;
  }

  const httpServer = http.createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE"],
    },
  });
  ioInstance = io;

  io.on("connection", async (socket) => {
    const userId = socket.handshake.query?.userId;
    socket.data.userId = userId;
    await redisDataClient.set(userId, socket.id);

    socket.on("disconnect", () => {
      const userId = socket.data?.userId;
      logger.info(`User ${userId} disconnected from socket ${socket.id}`);
    });
  });

  return httpServer;
};

redis.subscribe("Document-Status", (err, count) => {
  if (err) {
    logger.error("Failed to subscribe: %s", err.message);
  } else {
    logger.info(
      `Subscribed successfully! This client is currently subscribed to ${count} channels.`
    );
  }
});

redis.on("message", async (channel, data) => {
  if (channel === "Document-Status") {
    const message = JSON.parse(data);
    const userId = message.userId;
    const socketId = await redisDataClient.get(userId);
    if (socketId) {
      await ioInstance?.to(socketId).emit("Document-Status", message);
    }
  }
});

module.exports = {
  createServer,
  sendByUserId,
};
