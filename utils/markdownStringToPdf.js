const marked = require("marked");
const browserPromiseInstance = require("./puppeteerInstance.js");
const logger = require("./logger.js")("markdownStringToPdf");

async function markdownToPdfBytes(markdownString, width, height) {
  let page = null;

  try {
    if (!markdownString || typeof markdownString !== "string") {
      logger.warn(`Invalid markdown string: ${typeof markdownString}`);
      markdownString = "# Empty Feedback";
    }

    // Convert markdown to HTML
    logger.info(`Parsing markdown to HTML, length: ${markdownString.length}`);
    let htmlContent;
    try {
      htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body {
                font-family: Arial, sans-serif;
                line-height: 1.4;
                font-size: 1.6vmin;
                padding: 20mm;
              }
              h1 {
                font-size: 3.2vmin;
                color: #a69164;
                margin-bottom: 0pt;
                line-height: 1.2;
              }
              h2 {
                font-size: 2.4vmin;
                color: #a69164;
              }
              h3 {
                font-size: 2.4vmin;
                color: #a69164;
              }
            </style>
          </head>
          <body>
            ${marked.parse(markdownString)}
          </body>
        </html>
      `;
    } catch (parseError) {
      logger.error(`Error parsing markdown: ${parseError.message}`);
      htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body {
                font-family: Arial, sans-serif;
                line-height: 1.4;
                font-size: 1.6vmin;
                padding: 20mm;
              }
            </style>
          </head>
          <body>
            <pre>${markdownString}</pre>
          </body>
        </html>
      `;
    }

    const browser = await browserPromiseInstance;
    page = await browser.newPage();

    await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });
    logger.info("HTML content set to page");

    const scale = 0.75;
    logger.info(`Generating PDF with dimensions: ${width / scale}x${height / scale}`);
    const pdfBytes = await page.pdf({
      printBackground: true,
      width: width / scale,
      height,
      margin: {
        top: "30px",
        right: "0px",
        bottom: "30px",
        left: "0px",
      },
    });

    await page.close();
    return pdfBytes;
  } catch (error) {
    logger.error(error);

    throw error;
  }
}

module.exports = { markdownToPdfBytes };
