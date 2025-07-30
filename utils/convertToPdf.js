const { exec } = require("child_process");
const fs = require("fs");
const logger = require("./logger.js")("convertToPdf");
const path = require("path");

function convertDocxToPDF(file) {
  return new Promise((resolve, reject) => {
    const inputPath = path.join(__dirname, "wordToPDF.docx");
    const outputDir = __dirname;
    const outputPdfPath = path.join(__dirname, "wordToPDF.pdf");

    // Write DOCX file to disk
    const inputBuffer = fs.readFileSync(file.path);
    fs.writeFileSync(inputPath, inputBuffer);

    // Specify full path to soffice.exe
    const sofficePath = `${process.env.SOFFICE_PATH}`;

    // Command to convert using LibreOffice
    const command = `"${sofficePath}" --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`;

    exec(command, (error, _stdout, stderr) => {
      if (error) {
        logger.error(`Error during conversion: ${error.message}`);
        return reject(new Error(`Conversion failed: ${error.message}`));
      }
      if (stderr) {
        logger.error(`stderr: ${stderr}`);
        // Depending on the scenario, you might want to treat stderr as a warning
      }

      // Check if output PDF exists
      if (!fs.existsSync(outputPdfPath)) {
        logger.error("Conversion failed: Output PDF not found.");
        return reject(new Error("Conversion failed: Output PDF not found."));
      }

      try {
        // Read PDF into buffer
        const pdfBuffer = fs.readFileSync(outputPdfPath);

        // Cleanup temporary files
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPdfPath);

        resolve(pdfBuffer);
      } catch (err) {
        logger.error(err);
        reject(err);
      }
    });
  });
}

module.exports = { convertDocxToPDF };
