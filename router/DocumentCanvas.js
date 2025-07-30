const express = require("express");
const { InputPdfCanvas, InputPdf } = require("../mongoDB_schema");

const documentCanvasRouter = express.Router();

documentCanvasRouter.get("/:id", async (req, res) => {
  const item = await InputPdfCanvas.findOne({ inputPdfID: req.params.id });

  if (!item) return res.status(404).json({ message: "Document is not found" });

  res.status(200).json(item);
});

documentCanvasRouter.post("/:id", async (req, res) => {
  const [item, _] = await Promise.all([
    InputPdfCanvas.findOne({ inputPdfID: req.params.id }),
    InputPdf.findByIdAndUpdate(req.params.id, { canvasSave: true }),
  ]);

  const data = req.body;
  if (!item) {
    const payload = {
      ...data,
      inputPdfID: req.params.id,
    };
    const createdInputPDFCanvas = await InputPdfCanvas.create(payload);
    return res.status(200).json(createdInputPDFCanvas);
  }

  const updatedInputPDf = await InputPdfCanvas.findByIdAndUpdate(item._id, data, {
    new: true,
  });

  return res.status(200).json(updatedInputPDf);
});

module.exports = documentCanvasRouter;
