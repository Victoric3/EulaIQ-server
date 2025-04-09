const User = require("../Models/user");
const { sendToken } = require("../Helpers/auth/tokenHelpers");
const Email = require("../Helpers/Libraries/email");
const catchAsync = require("../Helpers/error/catchAsync");
const { comparePassword } = require("../Helpers/input/inputHelpers");
const {
  addIpAddress,
  checkIpAddressChange,
} = require("../Helpers/auth/deviceChange");
const { getAccessTokenFromCookies } = require("../Helpers/auth/tokenHelpers");
// const { createNotification } = require("./notification");
const {
  generateUniqueUsername,
} = require("../Helpers/auth/generateUniqueUsername");
const crypto = require("crypto");
const { generateAnonymousId } = require("../Helpers/auth/anonymousHelper");
const rateLimit = require("express-rate-limit");
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


const getPrivateData = (req, res, next) => {
  try {
    // console.log("got access to route");
    return res.status(200).json({
      success: true,
      message: "You got access to the private data in this route",
      user: req.user,
    });
  } catch (error) {
    // console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error You are not authorized to access this route",
    });
  }
};

const testmail = async (req, res) => {
  try {
    new Email(req.body.user, req.body.verificationToken).sendPasswordReset()
      // .catch(err => console.error("Email sending error:", err));
    res.status(201).json({
      success: true,
      message: "Email sent successfully",
    });
  } catch (e) {
    // console.log(e)
    res.status(500).json({
      success: false,
      message: "Error You are not authorized to access this route",
    });
  }
};

const register = async (req, res) => {
  const { firstname, lastname, email, password, ipAddress, anonymousId, deviceInfo } = req.body;

  try {
    // Check if this is an anonymous account conversion
    if (anonymousId) {
      const anonymousUser = await User.findOne({
        anonymousId,
        isAnonymous: true
      });

      if (anonymousUser) {
        // Convert anonymous account to full account
        anonymousUser.firstname = firstname;
        anonymousUser.lastname = lastname;
        anonymousUser.email = email;
        anonymousUser.password = password;
        anonymousUser.isAnonymous = false;
        anonymousUser.temporary = false;
        anonymousUser.emailStatus = "pending";
        anonymousUser.passwordHistory = [password];

        // Add new IP if not already present
        if (!anonymousUser.ipAddress.includes(ipAddress)) {
          anonymousUser.ipAddress.push(ipAddress);
        }

        const verificationToken = anonymousUser.createToken();

        // Add new session
        await anonymousUser.addSession({
          token: crypto.createHash('sha256').update(verificationToken).digest('hex'),
          device: deviceInfo,
          ipAddress
        });

        await anonymousUser.save();

        // Send verification email
        new Email(anonymousUser, verificationToken).sendConfirmEmail()
          // .catch(err => console.error("Email sending error:", err));

        return sendToken(anonymousUser, 200, res,
          "Anonymous account converted successfully. Please check your email to verify your account.",
          deviceInfo
        );
      }
    }

    // Check for existing email account
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        status: "failed",
        errorMessage: "Email already registered"
      });
    }

    // Create new user
    const newUser = await User.create({
      firstname,
      lastname,
      email,
      password,
      ipAddress: [ipAddress],
      anonymousId: anonymousId || generateAnonymousId(),
      username: await generateUniqueUsername(),
      isAnonymous: false,
      temporary: false,
      emailStatus: "pending",
      passwordHistory: [password]
    });

    newUser.passwordHistory = newUser.passwordHistory || [];
    newUser.passwordHistory.push(password);
    if (newUser.passwordHistory.length > 5) newUser.passwordHistory.shift();

    const verificationToken = newUser.createToken();

    await newUser.addSession({
      token: crypto.createHash('sha256').update(verificationToken).digest('hex'),
      device: deviceInfo,
      ipAddress
    });

    await newUser.save();

    new Email(newUser, verificationToken).sendConfirmEmail()
      // .catch(err => console.error("Email sending error:", err));

    return sendToken(newUser, 201, req, res,
      "Registration successful. Please check your email to verify your account.",
      deviceInfo
    );
  } catch (error) {
    // console.error("Registration error:", error);
    return res.status(500).json({
      status: "failed",
      errorMessage: "Internal server error"
    });
  }
};

const login = async (req, res) => {
  try {
    const { identity, password, ipAddress, device } = req.body;

    if (!identity || !password) {
      return res.status(400).json({
        status: "failed",
        errorMessage: "Email and password are required"
      });
    }

    const user = await User.findOne({ email: identity }).select("+password");

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
      new Email(user, verificationToken).sendUnUsualSignIn()
        // .catch(err => console.error("Email sending error:", err));

      return res.status(403).json({
        status: "verification_required",
        message: "New login location detected. Please verify your email.",
        requiresVerification: true
      });
    }

    // Update IP in background if verification not needed
    addIpAddress(user, ipAddress);

    return sendToken(user, 200, req, res, "Login successful", device);
  } catch (error) {
    // console.error("Login error:", error);
    return res.status(500).json({
      status: "failed",
      errorMessage: "Internal server error"
    });
  }
};

const changeUserName = async (req, res) => {
  // console.log("changeUserName called")
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
    try {
      resetPasswordToken = await user.createToken();
    } catch (err) {
      // console.log(err);
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
  // console.log(resetPasswordToken, newPassword )
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
    user.passwordHistory.push(newPassword);
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
    // console.error("Password reset error:", err);
    return res.status(500).json({
      status: "failed",
      errorMessage: "Internal server error"
    });
  }
};

const confirmEmailAndSignUp = catchAsync(async (req, res) => {
  try {
    const { token, deviceInfo } = req.body;
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
      // .catch(err => console.error("Welcome email error:", err));

    return sendToken(user, 200, req, res, "Email verified successfully. Welcome to EulaIQ!", deviceInfo);
  } catch (error) {
    // console.error("Email confirmation error:", error);
    return res.status(500).json({
      status: "failed",
      errorMessage: "Internal server error"
    });
  }
});

const unUsualSignIn = async (req, res) => {
  const { token, ipAddress, device } = req.body;
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

    return sendToken(user, 200, req, res, "Verification successful", device);
  } catch (err) {
    // console.error("Unusual signin error:", err);
    return res.status(500).json({
      status: "failed",
      errorMessage: "Internal server error"
    });
  }
};

const resendVerificationToken = catchAsync(async (req, res, next) => {
  try {

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
  } catch (e) {
    // console.error(e);
    res.status(500).json({
      status: "failed",
      errorMessage: "Internal server error"
    });
  }
});

const googleSignIn = async (req, res) => {
  try {
    // console.log("called google signin")
    const { idToken, deviceInfo, ipAddress } = req.body;
    // console.log("idToken: ", idToken)

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    // Find or create user
    let user = await User.findOne({ 
      $or: [
        { email, authProvider: 'google' },
        { googleId }
      ]
    });

    if (user) {
      // Update existing Google user
      user.photo = picture || user.photo;
      user.firstname = name?.split(' ')[0] || user.firstname;
      user.lastname = name?.split(' ').slice(1).join(' ') || user.lastname;
      
      // Add session
      await user.addSession({
        token: crypto.createHash('sha256').update(googleId).digest('hex'),
        device: deviceInfo,
        ipAddress
      });

      addIpAddress(user, ipAddress);
      await user.save();
      
      return sendToken(user, 200, req, res, "Welcome back!", deviceInfo);
    }

    // Check if email exists with password auth
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        status: 'auth_method_mismatch',
        errorMessage: 'This email is registered with password authentication. Please sign in with your password.'
      });
    }

    // Generate random password for Google users
    const newPassword = generateAnonymousId();

    // Create new Google user
    user = await User.create({
      email,
      firstname: name?.split(' ')[0] || '',
      lastname: name?.split(' ').slice(1).join(' ') || '',
      googleId,
      photo: picture,
      ipAddress: [ipAddress],
      deviceInfo: [deviceInfo],
      emailStatus: "confirmed",
      authProvider: 'google',
      isAnonymous: false,
      username: await generateUniqueUsername(),
      password: newPassword,
      passwordHistory: [newPassword]
    });

    // Add initial session
    await user.addSession({
      token: crypto.createHash('sha256').update(googleId).digest('hex'),
      device: deviceInfo,
      ipAddress
    });

    await user.save();

    // Send welcome email
    new Email(user).sendWelcome()
      // .catch(err => console.error("Welcome email error:", err));

    return sendToken(user, 201, req, res, "Welcome to EulaIQ!", deviceInfo);
  } catch (error) {
    // console.error("Google sign in error:", error);
    return res.status(500).json({
      status: "failed",
      errorMessage: "Could not verify Google credentials"
    });
  }
};

const signOut = async (req, res) => {
  try {
    // Get user from request (already set by validateSession middleware)
    const user = req.user;
    
    // Get token from cookie (same way validateSession gets it)
    const token = getAccessTokenFromCookies(req);
    
    if (!token) {
      return res.status(400).json({
        status: "failed",
        errorMessage: "No authentication token provided"
      });
    }
    
    // Hash the token to match what's stored in the database
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    // Remove this specific session from the sessions array
    user.sessions = user.sessions.filter(session => session.token !== hashedToken);
    
    // Remove the token from validTokens array
    user.validTokens = user.validTokens.filter(validToken => validToken !== hashedToken);
    
    await user.save();
    
    // Clear auth cookie
    res.clearCookie("access_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict"
    });
    
    return res.status(200).json({
      status: "success",
      message: "Successfully signed out"
    });
  } catch (error) {
    // console.error("Sign out error:", error);
    return res.status(500).json({
      status: "failed",
      errorMessage: "Internal server error"
    });
  }
};

const verificationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: "Too many verification attempts"
});

module.exports = {
  testmail,
  register,
  login,
  resetpassword,
  forgotpassword,
  getPrivateData,
  confirmEmailAndSignUp,
  resendVerificationToken,
  unUsualSignIn,
  changeUserName,
  verificationRateLimit,
  googleSignIn,
  signOut
};
