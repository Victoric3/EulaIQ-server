const express = require("express");

const {
  register,
  login,
  forgotpassword,
  resetpassword,
  getPrivateData,
  confirmEmailAndSignUp,
  resendVerificationToken,
  unUsualSignIn,
  verificationRateLimit
} = require("../Controllers/auth");

const { anonymousRateLimit, createAnonymousUser } = require("../Helpers/auth/anonymousHelper");

const { getAccessToRoute } = require("../Middlewares/Authorization/auth");

const router = express.Router();

router.post("/register", register);
router.post("/resendVerificationToken", verificationRateLimit, resendVerificationToken);
router.patch("/confirmEmailAndSignUp", confirmEmailAndSignUp);
router.patch("/unUsualSignIn", unUsualSignIn);
router.post("/anonymous", anonymousRateLimit, createAnonymousUser);

router.post("/login", login);

router.post("/forgotpassword", forgotpassword);

router.put("/resetpassword", resetpassword);

router.get("/private", getAccessToRoute, getPrivateData);


module.exports = router;
