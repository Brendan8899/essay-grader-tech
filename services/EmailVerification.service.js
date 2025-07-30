const nodeMailer = require("nodemailer");
const { UserVerified } = require("../mongoDB_schema.js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Read the SVG as a string
const RemarkablyIcon = fs.readFileSync(path.join(__dirname, "../lenor.svg"), "utf8");

// Create a transporter object using Gmail's SMTP server
const transporter = nodeMailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Send a verification email with a generated verification link
async function sendVerificationEmail(email, fullName) {
  const hashedNameAndEmail = generateHash(fullName, email);
  const verificationUrl = generateURL(hashedNameAndEmail);
  // HTML structure for the email with a logo and personalized message
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; text-align: center; background-color: #f9f9f9; padding: 30px;">
        ${RemarkablyIcon} <!-- SVG inserted directly -->
        <h1 style="color: #333;">Hello, ${fullName}!</h1>
        <p style="font-size: 16px; color: #555;">
            Welcome to <strong>Remarkably</strong>! We’re excited to have you on board.
        </p>
        <a href="${verificationUrl}" style="display: inline-block; padding: 15px 30px; margin-top: 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; font-size: 18px;">
            Verify Your Account
        </a>
        <p style="font-size: 12px; color: #aaa;">
            If you didn’t create an account, please ignore this email.
        </p>
    </div>
  `;
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Verification Email for Remarkably",
    html: htmlContent,
  });
}

// Generate a unique hash using the user’s name and email
function generateHash(fullName, email) {
  return crypto
    .createHash("sha256")
    .update(fullName + email)
    .digest("hex");
}

// Create a new user and store it in the database
async function createNewUser(fullName, email) {
  const hashedNameAndEmail = generateHash(fullName, email);
  const existingUser = await UserVerified.findOne({ hashedNameAndEmail });
  if (existingUser) {
    throw new Error("User already exists!");
  }
  const newUser = new UserVerified({
    fullName,
    email,
    paidTier: "",
    creditsLeft: 0,
    verifiedAccount: false,
    hashedNameAndEmail,
  });

  const savedNewUser = await newUser.save();
  return savedNewUser;
}

// Verify a user by their hash and update their account
async function verifyNewUser(hashedNameAndEmail) {
  // Find the user using the $or operator
  const existingUser = await UserVerified.findOne({
    $and: [{ hashedNameAndEmail: hashedNameAndEmail }, { verifiedAccount: false }],
  });

  if (!existingUser) {
    throw new Error("No User to verify account!");
  }

  // Update the user's account
  const userEntry = await UserVerified.findOneAndUpdate(
    { hashedNameAndEmail: hashedNameAndEmail },
    { verifiedAccount: true, creditsLeft: 100000 },
    { new: true }
  );

  if (!userEntry) {
    throw new Error("Error updating user");
  }

  return userEntry; // Optional: Return the updated user if needed
}

// Generate the verification URL
function generateURL(hashedNameAndEmail) {
  if (`${process.env.CURRENT_ENV}` == "staging") {
    return `${process.env.STAGING_URL}/verify?hash=${hashedNameAndEmail}`;
  } else if (`${process.env.CURRENT_ENV}` == "lianhua-prod") {
    return `${process.env.LIANHUA_PROD_URL}/verify?hash=${hashedNameAndEmail}`;
  } else {
    return `${process.env.PRODUCTION_URL}/verify?hash=${hashedNameAndEmail}`;
  }
}

module.exports = {
  sendVerificationEmail,
  createNewUser,
  verifyNewUser,
  generateURL,
  generateHash,
};
