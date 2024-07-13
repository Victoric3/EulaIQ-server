const isTokenIncluded = (req) => {
  return req.cookies && req.cookies.token;
};

const getAccessTokenFromCookies = (req) => {
  const token = req.cookies.token;

  if (!token) {
    throw new Error("Authentication token is missing");
  }

  return token;
};

const sendToken = (user, statusCode, res, message) => {
  const token = user.generateJwtFromUser();

  // Set cookie options
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ), // Cookie expiry set to the value in the environment variable
    httpOnly: process.env.NODE_ENV === "production", // Cookie cannot be accessed through client-side scripts
    secure: process.env.NODE_ENV === "production", // Send cookie only over HTTPS in production
  };
  // Send the response
  return res.status(statusCode).cookie("token", token, cookieOptions).json({
    status: "success",
    message,
  });
};

module.exports = {
  sendToken,
  isTokenIncluded,
  getAccessTokenFromCookies,
};
