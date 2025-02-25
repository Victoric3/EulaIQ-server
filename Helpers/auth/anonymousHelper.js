const User = require("../../Models/user");
const crypto = require("crypto");
const { generateUniqueUsername } = require("./generateUniqueUsername");
const { sendToken } = require("./tokenHelpers");
const rateLimit = require("express-rate-limit");

const generateAnonymousId = () => {
  return `anon_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
};

const validateDeviceInfo = (deviceInfo) => {
  if (!deviceInfo || !deviceInfo.deviceId) {
    throw new Error("Invalid device information provided");
  }
  return true;
};

const anonymousRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many anonymous accounts created from this IP"
});

const createAnonymousUser = async (ipAddress) => {
  try {
    const anonymousId = generateAnonymousId();
    const username = await generateUniqueUsername();
    const password = crypto.randomBytes(16).toString("hex");

    const anonymousUser = await User.create({
      username,
      email: `${anonymousId}@temp.com`,
      password,
      ipAddress: [ipAddress],
      isAnonymous: true,
      anonymousId,
      temporary: true
    });

    return anonymousUser;
  } catch (error) {
    throw new Error(`Failed to create anonymous user: ${error.message}`);
  }
};

const getAnonymousSession = async (req, res) => {
  try {
    const { deviceInfo, ipAddress, location } = req.body;
    console.log(deviceInfo, ipAddress, location);
    // Input validation
    if (!deviceInfo) {
      return res.status(400).json({
        status: "failed",
        errorMessage: "Device information is required",
      });
    }

    validateDeviceInfo(deviceInfo);

    // Use lean() for better performance on read operations
    let anonymousUser = await User.findOne({
      isAnonymous: true,
      "deviceInfo.deviceId": deviceInfo.deviceId,
    });

    // console.log("anonymousUser: ", anonymousUser);

    if (!anonymousUser) {
      anonymousUser = await createAnonymousUser(
        ipAddress
      );
      // console.log("anonymousUser:", anonymousUser);
    }

    return sendToken(anonymousUser, 200, res, "anonymous session created");
  } catch (error) {
    // console.error("Anonymous session error:", error);

    // More specific error messages based on error type
    const errorMessage =
      error.name === "ValidationError"
        ? "Invalid data provided"
        : "Could not create anonymous session";

    return res.status(500).json({
      status: "failed",
      errorMessage,
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  getAnonymousSession,
  createAnonymousUser,
  generateAnonymousId,
  validateDeviceInfo,
  anonymousRateLimit
};
