module.exports = {
  DOCUMENT: {
    WIDTH: 1340,
    HEIGHT: 1754,
  },
  REDIS: {
    port: parseInt(process.env.REDIS_PORT) || 6379,
    host: process.env.REDIS_HOST || "localhost",
    maxRetriesPerRequest: null,
  },
  TMP_FOLDER_PATH: "C:/tmp",
};
