const jwt = require("jsonwebtoken");
const crypto = require("crypto");

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

// Improved Implementation
const sendToken = async (user, statusCode, req, res, message, device) => {
  const token = user.generateJwtFromUser();
  const cookieOptions = {
    expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: 'strict',
    path: '/'
  };

  // Add session and token validation
  const sessionData = {
    token: crypto.createHash('sha256').update(token).digest('hex'),
    device,
    ipAddress: req.ip
  };
  
  await user.addSession(sessionData);
  user.validTokens = user.validTokens || [];
  user.validTokens.push(sessionData.token);
  await user.save();

  return res.status(statusCode)
    .cookie("token", token, cookieOptions)
    .json({
      status: "success",
      message,
      token
    });
};

module.exports = {
  sendToken,
  isTokenIncluded,
  getAccessTokenFromCookies,
};
