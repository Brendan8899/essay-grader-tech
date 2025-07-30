const puppeteer = require("puppeteer");

const browser = puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  executablePath: process.env.EXECUTABLE_PATH_CHROME ?? undefined,
});

module.exports = browser;
