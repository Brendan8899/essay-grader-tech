const passport = require("passport");
const BearerStrategy = require("passport-http-bearer").Strategy;
const { firebaseAdmin } = require("../config/firebase.js");
const createHttpError = require("http-errors");

async function extractUserFromToken(token) {
  return await firebaseAdmin
    .auth()
    .verifyIdToken(token)
    .then((decodedToken) => ({
      uid: decodedToken.uid,
      email: decodedToken.firebase.identities.email[0],
    }));
}

passport.use(
  new BearerStrategy((token, done) => {
    extractUserFromToken(token)
      .then((user) => {
        return done(null, user);
      })
      .catch((error) => {
        return done(createHttpError(401, error, { message: "Authentication failed!" }));
      });
  })
);

module.exports = passport.authenticate("bearer", { session: false });
