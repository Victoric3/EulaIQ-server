const CustomError = require("../../Helpers/error/CustomError");
const User = require("../../Models/user");
const jwt = require("jsonwebtoken");
const {
  isTokenIncluded,
  getAccessTokenFromCookies,
} = require("../../Helpers/auth/tokenHelpers");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

const getAccessToRoute = async (req, res, next) => {
  try {
    // console.log("hit get access token route");
    const { JWT_SECRET_KEY } = process.env;

    if (!isTokenIncluded(req)) {
      console.log(req.cookies);
      return next(new CustomError("No token added ", 400));
    }

    const accessToken = getAccessTokenFromCookies(req);
    const decoded = jwt.verify(accessToken, JWT_SECRET_KEY);

    const user = await User.findById(decoded.id);
    
    if (!user || user?.tokenVersion !== decoded?.tokenVersion) {
      return res
          .status(401)
          .json({
            errorMessage: "You are not authorized to access this route",
            status: "failed",
          })
    }

    req.user = user;
    next();
  } catch (error) {
    console.log(error);
    return next(res.status(500).json({ message: "internal server error", status: 'failed' }));
  }
};

const validateSession = async (req, res, next) => {
  try {
    const token = getAccessTokenFromCookies(req);
    // console.log(token);
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    // console.log("decoded: ", decoded);
    
    const user = await User.findById(decoded.id);
    // console.log("user", user);
    
    // Clean up expired sessions first
    await user.cleanupSessions();
    
    if (!user || !user.validateSession(token)) {
      return res.status(401).json({
        status: "failed",
        errorMessage: "Invalid or expired session"
      });
    }

    // Update session last active time
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const session = user.sessions.find(s => s.token === hashedToken);
    
    if (session) {
      session.lastActive = new Date();
      await user.save();
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Session validation error:", error);
    return res.status(401).json({
      status: "failed", 
      errorMessage: "Not authorized to access this route"
    });
  }
};

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2, // 2 requests per minute
  keyGenerator: (req) => {
    // Use the user object to identify the user
    return req.user.username; // Adjust this based on your user object structure
  },
});

module.exports = { getAccessToRoute, apiLimiter, validateSession };
