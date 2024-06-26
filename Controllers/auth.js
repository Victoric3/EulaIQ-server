const asyncErrorWrapper = require("express-async-handler");
const User = require("../Models/user");
const CustomError = require("../Helpers/error/CustomError");
const { sendToken } = require("../Helpers/auth/tokenHelpers");
const Email = require("../Helpers/Libraries/email");
const catchAsync = require("../Helpers/error/catchAsync");
const { comparePassword } = require("../Helpers/input/inputHelpers");
const {
  checkUserInfoChange,
  addUserInfo,
} = require("../Helpers/auth/deviceChange");
const {
  generateUniqueUsername,
} = require("../Helpers/auth/generateUniqueUsername");
const crypto = require("crypto");

const getPrivateData = asyncErrorWrapper((req, res, next) => {
  return res.status(200).json({
    success: true,
    message: "You got access to the private data in this route ",
    user: req.user,
  });
});

const register = async (req, res, next) => {
  const { firstname, lastname, grade, email, location, ipAddress, deviceInfo } =
    req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({
        status: "not found",
        message: "user doesn't exist",
      });
    }
    user.firstname = firstname;
    user.lastname = lastname;
    user.grade = grade;
    user.username = await generateUniqueUsername(user);
    user.temporary = false;
    addUserInfo(user, { location, ipAddress, deviceInfo });

    // Save the updated user information
    await user.save();

    sendToken(user, 200, res, "registration successful");
  } catch (e) {
    res.status(500).json({
      status: "failed",
      errorMessage: "internal server error",
    });
    console.log(e);
  }
};

const login = async (req, res, next) => {
  const { identity, password, location, ipAddress, deviceInfo } = req.body;
  console.log(identity, password, location, ipAddress, deviceInfo);
  try {
    if (!identity && !password) {
      res.status(400).json({
        status: "failed",
        errorMessage: "invalid email or password",
      });
      return;
    }
    //2 if email and password belongs to a user
    const user = await User.findOne({ email: identity }).select("+password");

    if (!user) {
      const newUser = await User.create({
        firstname: "firstname",
        lastname: "lastname",
        grade: "grade",
        temporary: true,
        username: "username",
        email: identity,
        password,
        photo:
          "https://i.ibb.co/N3vsnh9/e7982589-9001-476a-9945-65d56b8cd887.jpg",
        location: [location],
        ipAddress: [ipAddress],
        deviceInfo: [deviceInfo],
      });
      const verificationToken = newUser.createToken();
      await newUser.save();
      new Email(newUser, verificationToken).sendConfirmEmail();
      return res.status(404).json({
        status: "not found",
        errorMessage:
          "Please check your email to complete your account creation.",
      });
    } else if (!comparePassword(password, user.password)) {
      return res.status(401).json({
        status: "failed",
        errorMessage: "your email or password is incorrect",
      });
    } else if (user.emailStatus == "pending") {
      const verificationToken = user.createToken();
      await user.save();
      new Email(user, verificationToken).sendConfirmEmail();
      return res.status(401).json({
        status: "failed",
        errorMessage:
          "you have not verified your email, an email has been sent to you",
      });
    } else if (checkUserInfoChange(user, { location, deviceInfo, ipAddress })) {
      const verificationToken = user.createToken();
      await user.save();
      new Email(user, verificationToken).sendUnUsualSignIn();
      return res.status(401).json({
        status: "unauthorized",
        message: "Unusual sign-in detected. Please confirm your account.",
      });
    } else if (user.temporary) {
      return res.status(401).json({
        status: "temporary user",
        errormessage: "finish signing Up",
      });
    }
    sendToken(user, 200, res, "successful");
  } catch (error) {
    console.log(error);
  }
};

const forgotpassword = asyncErrorWrapper(async (req, res, next) => {
  const { URL, EMAIL_ACCOUNT } = process.env;

  const resetEmail = req.body.email;
  try {
    const user = await User.findOne({ email: resetEmail });
    if (!user) {
      return res.status(400).json({
        success: true,
        errorMessage: "There is no user with this email",
      });
    }

    const resetPasswordToken = user.getResetPasswordTokenFromUser();

    await user.save();

    const resetPasswordUrl = `${URL}/resetpassword?resetPasswordToken=${resetPasswordToken}`;

    await new Email(user, resetPasswordUrl).sendPasswordReset();

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

const resetpassword = asyncErrorWrapper(async (req, res, next) => {
  const newPassword = req.body.newPassword || req.body.password;

  const { resetPasswordToken } = req.query;

  try {
    if (!resetPasswordToken) {
      res.status(400).json({
        status: "failed",
        errorMessage: "Please provide a valid token",
      });
      return;
    }

    const user = await User.findOne({
      resetPasswordToken: resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });
    if (!user) {
      res.status(400).json({
        status: "failed",
        errorMessage: "Invalid token or Session Expired",
      });
      return;
    }

    user.password = newPassword;

    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    return res.status(200).json({
      success: "success",
      message: "Reset Password successfull",
    });
  } catch (err) {
    res.status(500).json({
      status: "failed",
      errorMessage: `internal server error`,
    });
  }
});

const confirmEmailAndSignUp = catchAsync(async (req, res, next) => {
  const { token } = req.body;
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
  user.emailStatus = "confirmed";
  user.verificationToken = undefined;
  user.verificationTokenExpires = undefined;
  await user.save();

  try {
    //send welcome email to new user
    new Email(user, `${process.env.URL}/addstory`).sendWelcome();
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

  res.status(200).json({
    message: `Your email has been confirmed`,
  });
  return;
});

const resendVerificationToken = catchAsync(async (req, res, next) => {
  const { token } = req.body;
  const hashedToken = crypto.createHash("shake256").update(token).digest("hex");
  const user = await User.findOne({
    verificationToken: hashedToken,
  });
  if (!user) {
    res.status(400).json({
      status: "failed",
      errorMessage:
        "This token is associated with an account that has already been verified or was not generated by us. If you received this token from us, please proceed to log in.",
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
};
