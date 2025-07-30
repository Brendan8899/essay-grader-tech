const Queue = require("bull");
const redisConfig = require("../config").REDIS;
const myQueue = new Queue("myQueue", {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: true,
  },
  settings: {
    lockDuration: 600000, //10 Minutes before considered as stalled
    stalledInterval: 30000, // check for stalls every 30 s
  },
});

const uploadQueue = new Queue("uploadQueue", {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: true,
  },
});
module.exports = { myQueue, uploadQueue };
