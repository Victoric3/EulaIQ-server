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

const sendToken = (user,statusCode ,res, message)=>{

    const token = user.generateJwtFromUser()

    return res.status(statusCode).json({
        status: 'success',
        message,
        token
    })

}

module.exports ={
    sendToken,
    isTokenIncluded,
    getAccessTokenFromHeader
}
