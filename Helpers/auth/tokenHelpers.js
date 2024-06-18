const isTokenIncluded =(req) => {
   
    return (
        req.headers.authorization && req.headers.authorization.startsWith("Bearer")
    )

}

const getAccessTokenFromHeader = (req) => {

    const authorization = req.headers.authorization

    const access_token = authorization.split(" ")[1]

    return access_token
}

const sendToken = (user, statusCode, res, message) => {
    const token = user.generateJwtFromUser();

    // Set cookie options
    const cookieOptions = {
        expires: new Date(
            Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
        ), // Cookie expiry set to the value in the environment variable
        httpOnly: process.env.NODE_ENV === 'production', // Cookie cannot be accessed through client-side scripts
        secure: process.env.NODE_ENV === 'production' // Send cookie only over HTTPS in production
    };

    // Set the token as a cookie
    res.cookie('token', token, cookieOptions);

    // Send the response
    return res.status(statusCode).json({
        status: 'success',
        message
    });
}


module.exports ={
    sendToken,
    isTokenIncluded,
    getAccessTokenFromHeader
}
