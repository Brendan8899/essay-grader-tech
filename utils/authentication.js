// Authentication middleware
const authenticate = function (req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("Authorization header is missing");
  }
  const [authType, userId] = authHeader.split(" ");
  if (authType !== "Bearer" || !userId) {
    return res.status(401).send("Invalid authorization format");
  }
  // TODO: Verify the userId from the database `Users`
  next();
};

module.exports = authenticate;
