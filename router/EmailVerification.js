const express = require("express");
const {
  createNewUser,
  sendVerificationEmail,
  verifyNewUser,
} = require("../services/EmailVerification.service.js");

const EmailVerificationRouter = express.Router();

EmailVerificationRouter.post("/sendVerificationEmail", async (req, res) => {
  const { email, fullName } = req.body;
  if (!email) {
    return res.status(400).send("Email Address not provided!");
  } else if (!fullName) {
    return res.status(400).send("Full Name not provided!");
  }
  await createNewUser(fullName, email);
  await sendVerificationEmail(email, fullName);
  return res.status(204).send();
});

EmailVerificationRouter.post("/verifyUser", async (req, res) => {
  const { hashedNameAndEmail } = req.body;
  await verifyNewUser(hashedNameAndEmail);
  return res.status(204).send();
});

module.exports = EmailVerificationRouter;
