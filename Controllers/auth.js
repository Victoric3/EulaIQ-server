const asyncErrorWrapper = require("express-async-handler");
const User = require("../Models/user");
const { sendToken } = require("../Helpers/auth/tokenHelpers");
const Email = require("../Helpers/Libraries/email");
const catchAsync = require("../Helpers/error/catchAsync");
const { comparePassword } = require("../Helpers/input/inputHelpers");
const {
  checkUserInfoChange,
  addUserInfo,
} = require("../Helpers/auth/deviceChange");
// const { createNotification } = require("./notification");
const {
  generateUniqueUsername,
} = require("../Helpers/auth/generateUniqueUsername");
const crypto = require("crypto");
const { generateAnonymousId } = require("../Helpers/auth/anonymousHelper");

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
  const {
    firstname,
    lastname,
    interests,
    email,
    location,
    ipAddress,
    deviceInfo,
    birthdate,
    anonymousId,
  } = req.body;

  try {
    // Try to find existing anonymous user or user with this email
    const [anonymousUser, existingUser] = await Promise.all([
      anonymousId ? User.findOne({ anonymousId, isAnonymous: true }) : null,
      User.findOne({ email, isAnonymous: false }),
    ]);

    const userData = {
      firstname,
      lastname,
      interests,
      email,
      birthdate,
      location: [location],
      ipAddress: [ipAddress],
      deviceInfo: [deviceInfo],
      temporary: false,
      isAnonymous: false,
      accountType: "registered",
    };

    if (existingUser) {
      // Update existing user
      Object.assign(existingUser, userData);
      existingUser.username = await generateUniqueUsername();
      existingUser.vouchers = 150;

      if (
        checkUserInfoChange(existingUser, { location, deviceInfo, ipAddress })
      ) {
        const verificationToken = existingUser.createToken();
        await Promise.all([
          existingUser.save(),
          new Email(existingUser, verificationToken).sendUnUsualSignIn(),
        ]);
        return res.status(401).json({
          status: "unauthorized",
          errorMessage: "Unusual sign-in detected. An email has been sent",
        });
      }

      await Promise.all([
        existingUser.save(),
        //send welcome email to new user
        new Email(existingUser, `${process.env.URL}`).sendWelcome(),
      ]);
      return sendToken(existingUser, 200, res, "registration successful");
    }

    if (anonymousUser) {
      // Convert anonymous user
      Object.assign(anonymousUser, userData);
      anonymousUser.vouchers += 150;
      if (
        checkUserInfoChange(anonymousUser, { location, deviceInfo, ipAddress })
      ) {
        const verificationToken = anonymousUser.createToken();
        await Promise.all([
          anonymousUser.save(),
          new Email(anonymousUser, verificationToken).sendUnUsualSignIn(),
        ]);
        return res.status(401).json({
          status: "unauthorized",
          errorMessage: "Unusual sign-in detected. An email has been sent",
        });
      }

      await Promise.all([
        anonymousUser.save(),
        //send welcome email to new user
        new Email(anonymousUser, `${process.env.URL}`).sendWelcome(),
      ]);

      return sendToken(anonymousUser, 200, res, "registration successful");
    }

    // Create new user
    const newUser = new User(userData);
    newUser.username = await generateUniqueUsername(newUser);
    const verificationToken = newUser.createToken();

    await Promise.all([
      newUser.save(),
      new Email(newUser, verificationToken).sendConfirmEmail(),
    ]);

    return sendToken(newUser, 200, res, "registration successful");
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({
      status: "failed",
      errorMessage: "internal server error",
    });
  }
};

const login = async (req, res) => {
  try {
    const {
      identity,
      password,
      location,
      ipAddress,
      deviceInfo,
      isAnonymous,
      anonymousId,
    } = req.body;
    // console.log(location, ipAddress, deviceInfo);
    const [anonymousUser, user] = await Promise.all([
      anonymousId
        ? User.findOne({ anonymousId, isAnonymous: true }).select(
            "+password firstname email"
          )
        : null,
      User.findOne({ email: identity }).select(
        "+password emailStatus temporary location ipAddress deviceInfo role email firstname username tokenVersion"
      ),
    ]);
    console.log("anonymousUser: ", anonymousUser, "user: ", user);

    // Early validation checks
    if (isAnonymous && !user) {
      console.log("user: ", user);
      //create a token
      const verificationToken = anonymousUser.createToken();
      // console.log("verificationToken: ", verificationToken)
      // console.log("anonymousUser: ", anonymousUser)
      //assign email to anonymous user
      anonymousUser.email = identity;
      anonymousUser.password = password;

      //save anonymous user and send verify token
      await Promise.all([
        anonymousUser.save(),
        new Email(anonymousUser, verificationToken).sendConfirmEmail(),
      ]);

      return res.status(401).json({
        status: "anonymous",
        errorMessage:
          "Please check your email to complete your account creation",
      });
    }

    if (!identity || !password) {
      return res.status(400).json({
        status: "failed",
        errorMessage: "invalid email or password",
      });
    }

    // Handle non-existent user case
    if (!user) {
      const anonymousId = generateAnonymousId();
      console.log("trying to create new user");
      // Create new user asynchronously
      const newUserPromise = await User.create({
        firstname: "firstname",
        lastname: "lastname",
        birthdate: "birthdate",
        temporary: true,
        username: "username",
        email: identity,
        password,
        photo:
          "https://i.ibb.co/N3vsnh9/e7982589-9001-476a-9945-65d56b8cd887.jpg",
        location: [location],
        ipAddress: [ipAddress],
        deviceInfo: [deviceInfo],
        anonymousId,
      });
      console.log("newUserPromise: ", newUserPromise);
      const verificationToken = newUserPromise.createToken();

      // Perform save and email operations in parallel
      await Promise.all([
        newUserPromise.save(),
        new Email(newUserPromise, verificationToken).sendConfirmEmail(),
      ]);

      return res.status(404).json({
        status: "not found",
        errorMessage:
          "Please check your email to complete your account creation.",
      });
    }

    // Password check
    if (!comparePassword(password, user.password)) {
      return res.status(400).json({
        status: "failed",
        errorMessage: "your email or password is incorrect",
      });
    }

    // Status checks using early returns
    if (user.emailStatus === "pending") {
      const verificationToken = user.createToken();
      console.log("trying to send verification token", user);
      // Parallel operations
      await Promise.all([
        user.save(),
        new Email(user, verificationToken).sendConfirmEmail(),
      ]);

      return res.status(401).json({
        status: "unverified email",
        errorMessage:
          "you have not verified your email, an email has been sent to you",
      });
    }

    if (user.temporary) {
      return res.status(401).json({
        status: "temporary user",
        errorMessage: "finish signing Up",
      });
    }

    // Check for unusual login
    const isUnusualLogin = checkUserInfoChange(user, {
      location,
      deviceInfo,
      ipAddress,
    });
    if (isUnusualLogin) {
      const verificationToken = user.createToken();

      // Parallel operations
      await Promise.all([
        user.save(),
        new Email(user, verificationToken).sendUnUsualSignIn(),
      ]);

      return res.status(401).json({
        status: "unauthorized",
        errorMessage: "Unusual sign-in detected. An email has been sent",
      });
    }

    // Create notification asynchronously without waiting
    // createNotification(
    //   user._id,
    //   "NEW_LOGIN",
    //   "New Login Detected",
    //   `A new login to your account was detected from a device: ${deviceInfo.deviceType} running ${deviceInfo.os}. If this was you, no further action is required. If you did not authorize this login, please secure your account immediately to protect your information.`,
    //   { identity }
    // ).catch((error) => console.error("Notification creation error:", error));

    // Send successful response
    return sendToken(user, 200, res, "successful");
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      status: "failed",
      errorMessage: "Internal server error",
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

const forgotpassword = asyncErrorWrapper(async (req, res, next) => {
  const { URL } = process.env;

  const resetEmail = req.body.email;
  try {
    const user = await User.findOne({ email: resetEmail });
    if (!user) {
      return res.status(400).json({
        success: true,
        errorMessage: "There is no user with this email",
      });
    }

    const resetPasswordToken = user.createToken();

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
});

const resetpassword = async (req, res) => {
  const { resetPasswordToken, newPassword } = req.body;
  try {
    if (!resetPasswordToken) {
      res.status(400).json({
        status: "failed",
        errorMessage: "Please provide a valid token",
      });
      return;
    }
    const hashedToken = crypto
      .createHash("shake256")
      .update(resetPasswordToken)
      .digest("hex");

    const user = await User.findOne({
      verificationToken: hashedToken,
      verificationTokenExpires: { $gt: Date.now() },
    }).select("+password");
    if (!user) {
      return res.status(400).json({
        status: "failed",
        errorMessage: "Invalid token or Session Expired",
      });
    }
    if (comparePassword(newPassword, user.password)) {
      return res.status(400).json({
        errorMessage:
          "please add a password you have never used with this account before",
      });
    }
    user.password = newPassword;
    user.tokenVersion += 1;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;

    await user.save();
    console.log("actually completed: ", user);

    return res.status(200).json({
      success: true,
      message: "Reset Password successfull",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      status: "failed",
      errorMessage: `internal server error`,
    });
  }
};

const confirmEmailAndSignUp = catchAsync(async (req, res, next) => {
  try {
    const { token } = req.body;
    //1  get user based on token
    const hashedToken = crypto
      .createHash("shake256")
      .update(token)
      .digest("hex");
    const user = await User.findOne({
      verificationToken: hashedToken,
      verificationTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
      res.status(400).json({
        status: "failed",
        errorMessage: `this token is invalid or has expired`,
      });
      return;
    }
    //2 set verify user status to confirmed
    user.emailStatus = "confirmed";
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    res.status(200).json({
      message: `Your email has been confirmed`,
    });
    return;
  } catch (e) {
    res.status(404).json({
      status: "failed",
      message: e.message,
    });
  }
});

const unUsualSignIn = catchAsync(async (req, res, next) => {
  const { token, location, deviceInfo, ipAddress } = req.body;
  //1  get user based on token
  const hashedToken = crypto.createHash("shake256").update(token).digest("hex");
  const user = await User.findOne({
    verificationToken: hashedToken,
    verificationTokenExpires: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400).json({
      status: "failed",
      errorMessage: `this token is invalid or has expired`,
    });
    return;
  }
  //2 set verify user status to confirmed
  addUserInfo(user, { location, deviceInfo, ipAddress });
  user.verificationToken = undefined;
  user.verificationTokenExpires = undefined;
  await user.save();
  sendToken(user, 200, res, "verification successful");
  return;
});

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
};
