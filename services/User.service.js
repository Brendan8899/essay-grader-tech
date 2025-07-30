const { UserVerified } = require("../mongoDB_schema.js");
const createError = require("http-errors");
const { auth } = require("../config/firebase.js");
const {
  createUserWithEmailAndPassword,
  AuthErrorCodes,
  sendEmailVerification,
  sendPasswordResetEmail,
} = require("firebase/auth");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendForgotPasswordEmail(email) {
  if (!EMAIL_REGEX.test(email)) {
    throw new createError(400, null, { message: "Invalid Email Format!" });
  }
  await sendPasswordResetEmail(auth, email);
}

/**
 * create a new user in the database and firebase if it doesn't already exist, the existence is checked by userId or email
 */
async function register(name, email, password) {
  let userCredential;
  try {
    userCredential = await createUserWithEmailAndPassword(auth, email, password);
  } catch (error) {
    if (error.code === AuthErrorCodes.EMAIL_EXISTS) {
      throw createError(400, error, { message: "User already exists!" });
    } else if (error.code === AuthErrorCodes.INVALID_EMAIL) {
      throw createError(400, error, { message: "Invalid Email Format!" });
    }
    throw error;
  }
  const newUser = new UserVerified({
    fullName: name,
    userId: userCredential.user.uid,
    email,
    verifiedAccount: true,
  });
  await newUser.save();
  sendEmailVerification(userCredential.user);
  return newUser;
}

module.exports = {
  register,
  sendForgotPasswordEmail,
};
