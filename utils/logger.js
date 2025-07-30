const { createLogger, format, transports, addColors } = require("winston");
require("winston-daily-rotate-file");

const LOG_FOLDER = "./logs";

addColors({
  http: "blue",
});

const customFormat = format.printf(({ level, message, label, timestamp, stack }) => {
  if (typeof message === "object") {
    message = JSON.stringify(message);
  }
  return `${timestamp} [${label}] ${level}: ${stack || message}`;
});

const TRANSPORTS = {
  CONSOLE: new transports.Console({ level: "debug", format: format.colorize({ all: true }) }),
  INFO_FILE: new transports.File({ level: "info", filename: LOG_FOLDER + "/combined.log" }),
  ERROR_FILE: new transports.File({ level: "error", filename: LOG_FOLDER + "/error.log" }),
  BACKUP: new transports.DailyRotateFile({
    filename: LOG_FOLDER + "/lenor-backend-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    maxSize: "30m",
    maxFiles: "365d",
  }),
  EXCEPTION_FILE: new transports.File({ filename: LOG_FOLDER + "/exceptions.log" }),
};

const logger = createLogger({
  format: format.combine(format.timestamp(), format.errors({ stack: true }), customFormat),
  transports: [TRANSPORTS.CONSOLE, TRANSPORTS.INFO_FILE, TRANSPORTS.ERROR_FILE, TRANSPORTS.BACKUP],
  exceptionHandlers: [TRANSPORTS.CONSOLE, TRANSPORTS.EXCEPTION_FILE],
});

module.exports = (label) => logger.child({ label });
