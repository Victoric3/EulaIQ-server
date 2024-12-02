const jwt = require("jsonwebtoken");

const isTokenIncluded = (req) => {
  return (
    (req.cookies && req.cookies.token) ||
    req.headers.authorization?.startsWith("Bearer ")
  );
};

const getAccessTokenFromCookies = (req) => {
  // Check cookie first
  const cookieToken = req.cookies?.token;

  // Check Authorization header if no cookie token
  const bearerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.split(" ")[1]
    : null;

  // Use whichever token is available
  const token = cookieToken || bearerToken;
  // console.log("token from cookie: ", token);

  if (!token) {
    throw new Error("Authentication token is missing");
  }

  return token;
};

const sendToken = (user, statusCode, res, message) => {
  const token = user.generateJwtFromUser();
  const decoded = jwt.decode(token);
  // Set cookie options
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  // Send the response
  return res.status(statusCode).cookie("token", token, cookieOptions).json({
    status: "success",
    message,
    role: user.role,
    token: token,
  });
};

module.exports = {
  sendToken,
  isTokenIncluded,
  getAccessTokenFromCookies,
};
