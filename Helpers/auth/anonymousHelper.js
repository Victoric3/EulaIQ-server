const User = require("../../Models/user");
const crypto = require("crypto");
const { generateUniqueUsername } = require("./generateUniqueUsername");
const { sendToken } = require("./tokenHelpers");

const generateAnonymousId = () => {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(12).toString("hex");
  return `anon_${timestamp}_${randomBytes}`;
};

const validateDeviceInfo = (deviceInfo) => {
  if (!deviceInfo || !deviceInfo.deviceId) {
    throw new Error("Invalid device information provided");
  }
  return true;
};

const createAnonymousUser = async (deviceInfo, ipAddress, location) => {
  try {
    const anonymousId = generateAnonymousId();
    const username = await generateUniqueUsername();
    console.log("username: ", username);
    const password = crypto.randomBytes(32).toString("hex");
    console.log("password: ", password);
    const anonymousUser = await User.create({
      firstname: username,
      lastname: "lastname",
      birthdate: "birthdate",
      temporary: true,
      username: username,
      email: `${anonymousId}@novelnooks.com`,
      password: password,
      photo:
        "https://i.ibb.co/N3vsnh9/e7982589-9001-476a-9945-65d56b8cd887.jpg",
      location: [location],
      ipAddress: [ipAddress],
      deviceInfo: [deviceInfo],
      isAnonymous: true,
      anonymousId: anonymousId,
      accountType: "anonymous",
    });

    // Add index hints for better performance
    const savedUser = await anonymousUser.save();
    console.log("savedUser: ", savedUser);
    console.log("user has been saved, moving on..");
    return savedUser;
  } catch (error) {
    console.error("Error creating anonymous user:", error);
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
        deviceInfo,
        ipAddress,
        location
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
};
