const asyncErrorWrapper = require("express-async-handler");
const User = require("../Models/user");
const { sendToken } = require("../Helpers/auth/tokenHelpers");
const Email = require("../Helpers/Libraries/email");
const catchAsync = require("../Helpers/error/catchAsync");
const { comparePassword } = require("../Helpers/input/inputHelpers");
const {
  addIpAddress,
  checkIpAddressChange,
} = require("../Helpers/auth/deviceChange");
// const { createNotification } = require("./notification");
const {
  generateUniqueUsername,
} = require("../Helpers/auth/generateUniqueUsername");
const crypto = require("crypto");
const { generateAnonymousId } = require("../Helpers/auth/anonymousHelper");
const rateLimit = require("express-rate-limit");

const getPrivateData = (req, res, next) => {
  try {
    console.log("got access to route");
    return res.status(200).json({
      success: true,
      message: "You got access to the private data in this route",
      user: req.user,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error You are not authorized to access this route",
    });
  }
};

const register = async (req, res) => {
  const { email, password, ipAddress, anonymousId } = req.body;

  try {
    const existingUser = await User.findOne({
      $or: [
        { email },
        { anonymousId }
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        status: "failed",
        errorMessage: "User already exists"
      });
    }

    const newUser = await User.create({
      email,
      password,
      ipAddress: [ipAddress],
      anonymousId: anonymousId || generateAnonymousId(),
      username: await generateUniqueUsername(),
      isAnonymous: false,
      temporary: false,
      emailStatus: "pending",
      passwordHistory: [password] // Initialize password history
    });

    const verificationToken = newUser.createToken();
    
    // Add initial session
    await newUser.addSession({
      token: crypto.createHash('sha256').update(verificationToken).digest('hex'),
      device: req.headers['user-agent'],
      ipAddress
    });
    
    await newUser.save();

    // Send verification email in background
    new Email(newUser, verificationToken).sendConfirmEmail()
      .catch(err => console.error("Email sending error:", err));

    return sendToken(newUser, 201, res, "Registration successful. Please check your email to verify your account.");
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({
      status: "failed",
      errorMessage: "Internal server error"
    });
  }
};

const login = async (req, res) => {
  try {
    const { identity, password, ipAddress, anonymousId } = req.body;

    if (!identity || !password) {
      return res.status(400).json({
        status: "failed",
        errorMessage: "Email and password are required"
      });
    }

    const user = await User.findOne({
      $or: [
        { email: identity },
        { anonymousId }
      ]
    }).select("+password");

    if (!user || !comparePassword(password, user.password)) {
      return res.status(400).json({
        status: "failed",
        errorMessage: "Invalid credentials"
      });
    }

    // Check for unusual IP address
    if (checkIpAddressChange(user, ipAddress)) {
      const verificationToken = user.createToken();
      await user.save();
      
      // Send verification email in background
      new Email(user, verificationToken).sendUnusualSignIn()
        .catch(err => console.error("Email sending error:", err));

      return res.status(403).json({
        status: "verification_required",
        message: "New login location detected. Please verify your email.",
        requiresVerification: true
      });
    }

    // Update IP in background if verification not needed
    addIpAddress(user, ipAddress);
    user.save().catch(console.error);

    return sendToken(user, 200, res, "Login successful");
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      status: "failed",
      errorMessage: "Internal server error"
    });
  }
};

const changeUserName = async (req, res) => {
  const { newUsername } = req.body;
  let user = req.user;
  try {
    user = await User.findOne({ _id: req.user._id });
    if (!user) {
      return res.status(400).json({
        success: true,
        errorMessage: "There is no user with this email",
      });
    }
    const usernameExists = await User.findOne({ username: newUsername });
    const isUsernameTaken = usernameExists ? true : false;
    if (isUsernameTaken) {
      return res.status(400).json({
        success: true,
        errorMessage: "There is already a user with this username",
      });
    }
    user.username = newUsername;
    await user.save();
    res.status(200).json({
      message: "username updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      errorMessage: "internal server error",
    });
  }
};

const forgotpassword = async (req, res) => {
  const resetEmail = req.body.email;
  try {
    const user = await User.findOne({ email: resetEmail });
    if (!user) {
      return res.status(400).json({
        success: true,
        errorMessage: "There is no user with this email",
      });
    }

    let resetPasswordToken;
    console.log("user: ", user);
    try {
      resetPasswordToken = await user.createToken();
      console.log("resetPasswordToken: ", resetPasswordToken);
    } catch (err) {
      console.log(err);
    }
    await user.save();

    await new Email(user, resetPasswordToken).sendPasswordReset();

    return res.status(200).json({
      success: true,
      message: "Email Sent",
    });
  } catch (error) {
    res.status(500).json({
      status: "failed",
      errorMessage: `internal server error`,
    });
  }
};

const resetpassword = async (req, res) => {
  const { resetPasswordToken, newPassword } = req.body;
  try {
    if (!resetPasswordToken) {
      return res.status(400).json({
        status: "failed",
        errorMessage: "Please provide a valid token"
      });
    }

    const hashedToken = crypto
      .createHash("shake256")
      .update(resetPasswordToken)
      .digest("hex");

    const user = await User.findOne({
      verificationToken: hashedToken,
      verificationTokenExpires: { $gt: Date.now() }
    }).select("+password +passwordHistory");

    if (!user) {
      return res.status(400).json({
        status: "failed",
        errorMessage: "Invalid token or Session Expired"
      });
    }

    // Check password history
    if (await user.isPasswordPreviouslyUsed(newPassword)) {
      return res.status(400).json({
        status: "failed",
        errorMessage: "Please use a password you haven't used before"
      });
    }

    // Update password and history
    user.passwordHistory = user.passwordHistory || [];
    user.passwordHistory.push(user.password);
    if (user.passwordHistory.length > 5) user.passwordHistory.shift();
    
    user.password = newPassword;
    user.tokenVersion += 1;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;

    // Invalidate all sessions
    user.sessions = [];
    user.validTokens = [];

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successful"
    });
  } catch (err) {
    console.error("Password reset error:", err);
    return res.status(500).json({
      status: "failed",
      errorMessage: "Internal server error"
    });
  }
};

const confirmEmailAndSignUp = catchAsync(async (req, res) => {
  try {
    const { token } = req.body;
    const hashedToken = crypto
      .createHash("shake256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      verificationToken: hashedToken,
      verificationTokenExpires: { $gt: Date.now() },
      emailStatus: "pending"
    });

    if (!user) {
      return res.status(400).json({
        status: "failed",
        errorMessage: "Invalid or expired verification token"
      });
    }

    user.emailStatus = "confirmed";
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    // Send welcome email after confirmation
    new Email(user).sendWelcome()
      .catch(err => console.error("Welcome email error:", err));

    return sendToken(user, 200, res, "Email verified successfully. Welcome to EulaIQ!");
  } catch (error) {
    console.error("Email confirmation error:", error);
    return res.status(500).json({
      status: "failed",
      errorMessage: "Internal server error"
    });
  }
});

const unUsualSignIn = async (req, res) => {
  const { token, ipAddress } = req.body;
  try {
    const hashedToken = crypto.createHash("shake256").update(token).digest("hex");
    const user = await User.findOne({
      verificationToken: hashedToken,
      verificationTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        status: "failed",
        errorMessage: "Invalid token or session expired"
      });
    }

    // Add new IP address
    addIpAddress(user, ipAddress);
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    return sendToken(user, 200, res, "Verification successful");
  } catch (err) {
    console.error("Unusual signin error:", err);
    return res.status(500).json({
      status: "failed",
      errorMessage: "Internal server error"
    });
  }
};

//TODO: correct security breech caused by alloowing sign in without password
const resendVerificationToken = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  const user = await User.findOne({
    email,
  });
  if (!user) {
    res.status(400).json({
      status: "failed",
      errorMessage: "user not found",
    });
    return;
  }
  const verificationToken = user.createToken();
  await user.save();
  await new Email(user, verificationToken).sendverificationtoken();
  res.status(200).json({
    status: "success",
    message:
      "An email has been sent to your inbox for verification. Please proceed to verify your email.",
  });
});

const verificationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: "Too many verification attempts"
});

module.exports = {
  register,
  login,
  resetpassword,
  forgotpassword,
  getPrivateData,
  confirmEmailAndSignUp,
  resendVerificationToken,
  unUsualSignIn,
  changeUserName,
  verificationRateLimit
};
