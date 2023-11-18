const CustomError = require("../../Helpers/error/CustomError");
const User = require("../../Models/user")
const jwt = require("jsonwebtoken");
const asyncErrorWrapper =require("express-async-handler")
const { isTokenIncluded ,getAccessTokenFromHeader} = require("../../Helpers/auth/tokenHelpers");
const express = require('express');
const rateLimit = require('express-rate-limit');

const getAccessToRoute = asyncErrorWrapper(async(req,res,next) =>{
    try{

        const {JWT_SECRET_KEY} =process.env ;
        
    if(!isTokenIncluded(req)) {

        return next(new CustomError("No token added ", 400))
    }

    const accessToken = getAccessTokenFromHeader(req)

    const decoded = jwt.verify(accessToken,JWT_SECRET_KEY) ;

    const user = await User.findById(decoded.id)
   
    if(!user) {
        return next(new CustomError("You are not authorized to access this route ", 401))
    }

    req.user = user ; 

}catch(error){
    return next(new CustomError("internal server error", 500))
}
    next()

})

const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 2, // 2 requests per minute
    keyGenerator: (req) => {
      // Use the user object to identify the user
      return req.user.username; // Adjust this based on your user object structure
    },
  });


module.exports ={getAccessToRoute, apiLimiter}