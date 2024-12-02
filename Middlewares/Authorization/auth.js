const CustomError = require("../../Helpers/error/CustomError");
const User = require("../../Models/user");
const jwt = require("jsonwebtoken");
const asyncErrorWrapper = require("express-async-handler");
const {
  isTokenIncluded,
  getAccessTokenFromCookies,
} = require("../../Helpers/auth/tokenHelpers");
const express = require("express");
const rateLimit = require("express-rate-limit");

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

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2, // 2 requests per minute
  keyGenerator: (req) => {
    // Use the user object to identify the user
    return req.user.username; // Adjust this based on your user object structure
  },
});

module.exports = { getAccessToRoute, apiLimiter };
