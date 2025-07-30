const express = require("express");
const { register, sendForgotPasswordEmail } = require("../services/User.service");
const router = express.Router();

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  await sendForgotPasswordEmail(email);
  return res.status(200).json({
    success: true,
    message: `Forgot password email sent successfully to ${email}`,
  });
});

/**
 * add a new user to the database
 */
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  const response = await register(name, email, password);
  return res.status(201).json({
    success: true,
    message: "User created successfully",
    data: { userId: response.userId },
  });
});

module.exports = router;
