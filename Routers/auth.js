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
} = require("../Controllers/auth");

const { getAccessToRoute } = require("../Middlewares/Authorization/auth");

const router = express.Router();

router.post("/register", register);
router.post("/resendVerificationToken", resendVerificationToken);
router.patch("/confirmEmailAndSignUp", confirmEmailAndSignUp);
router.patch("/unUsualSignIn", unUsualSignIn);

router.post("/login", login);

router.post("/forgotpassword", forgotpassword);

router.put("/resetpassword", resetpassword);

router.get("/private", getAccessToRoute, getPrivateData);

module.exports = router;
