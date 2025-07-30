const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger.js")("cron");
const { TMP_FOLDER_PATH } = require("../config");

/**
 * Deletes all files or folders under the project temporary folder.
 * Only those files and folders that were modified at least **7 days** ago will be deleted.
 */
const cleanProjectTemporaryFolder = () => {
  logger.info("Clearing project temporary folder started");
  const rootPath = path.join("./", TMP_FOLDER_PATH);
  const SEVEN_DAYS_IN_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;
  const timeNow = new Date();
  const filesToBeDeleted = fs
    .readdirSync(rootPath)
    .map((filePath) => path.join(rootPath, filePath))
    .filter(
      (filePath) => timeNow - new Date(fs.statSync(filePath).mtime) > SEVEN_DAYS_IN_MILLISECONDS
    );
  filesToBeDeleted.forEach((filePath) => {
    fs.rmSync(filePath, { recursive: true, force: true });
  });
  logger.info(`Deleted ${filesToBeDeleted.length} files in project temporary folder`);
};

/**
 * Runs every Sunday at 4am (UTC+8).
 */
cron.schedule("0 20 * * SAT", () => {
  cleanProjectTemporaryFolder();
});

logger.info(`CRON jobs scheduled`);
