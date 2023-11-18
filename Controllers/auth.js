const asyncErrorWrapper = require("express-async-handler")
const User = require("../Models/user");
const CustomError = require("../Helpers/error/CustomError");
const { sendToken } = require("../Helpers/auth/tokenHelpers");
const Email = require("../Helpers/Libraries/email");
const catchAsync = require("../Helpers/error/catchAsync");
const { validateUserInput,comparePassword } = require("../Helpers/input/inputHelpers");
const crypto = require("crypto")


const getPrivateData = asyncErrorWrapper((req,res,next) =>{

    return res.status(200).json({
        success:true ,
        message : "You got access to the private data in this route ",
        user : req.user

    })

})

const register = async  (req,res,next) => {

    const { username, email, password} = req.body;

    const emailCheck = await User.findOne({ email }); 
      if (emailCheck) {
      res.status(400).json({ 
        status: 'failed',
        errorMessage: 'This email is already associated with an account' 
    });
    return
    }
    const userNameCheck = await User.findOne({ username }); 
    if (userNameCheck) {
        res.status(400).json({ 
            status: 'failed',
            errorMessage: 'This userName is already associated with an account' });
        return
      }
    try{

        const newUser = await User.create({
            username,
            email,
            password
        })
        const verificationToken = newUser.createToken()
        await newUser.save()
        new Email(newUser, verificationToken).sendConfirmEmail()
        res.status(200).json({
            status: 'success',
            message: 'account created successfully, please verify your email'
        })
    }catch(e){
        res.status(500).json({
            status: 'failed',
            errorMessage: 'internal server error'
        })
    }
        
  

}

const login  = asyncErrorWrapper (async(req,res,next) => {

    const { identity, password } = req.body
    
    if(!identity && !password){
        res.status(400).json({
            status: 'failed',
            errorMessage: 'invalid email or password'
          })
    return
    };
    //2 if email and password belongs to a user
    const user = await User.findOne(
        {$or: [{ email: identity }, 
            { username: identity }]})
            .select('+password');
   

    if(!user || !comparePassword(password, user.password)){
        res.status(401).json({
            status: 'failed',
            errorMessage: 'your email or password is incorrect'
          })
        return}
    if(user.emailStatus == 'pending'){
        const verificationToken = user.createToken()
        await user.save()
        new Email(user, verificationToken).sendConfirmEmail()
        res.status(401).json({
            status: 'failed',
            errorMessage: 'you have not verified your email, an email has been sent to you'
        })
        return
    }
   
    sendToken(user ,200,res, 'successful');

    
})




const forgotpassword  = asyncErrorWrapper( async (req,res,next) => {
    const {URL,EMAIL_ACCOUNT} = process.env ; 

    const resetEmail = req.body.email  ;

    const user = await User.findOne({email : resetEmail})
    if(!user ) {
        return res.status(400)
        .json({
            success: true,
            errorMessage: "There is no user with that email"
        })
    }

    const resetPasswordToken = user.getResetPasswordTokenFromUser();

    await user.save()  ;

    const resetPasswordUrl = `${URL}/resetpassword?resetPasswordToken=${resetPasswordToken}`

    try {

        new Email(user, resetPasswordUrl).sendPasswordReset()

        return res.status(200)
        .json({
            success: true,
            message: "Email Sent"
        })

    }

    catch(error ) {

        user.resetPasswordToken = undefined ;
        user.resetPasswordExpire = undefined  ;

        await user.save();
   
        res.status(500).json({
            status: 'failed',
            errorMessage: `internal server error`
        })
    }



})


const resetpassword  =asyncErrorWrapper(  async (req,res,next) => {
    
    const newPassword = req.body.newPassword || req.body.password
    
    const {resetPasswordToken} = req.query
    
    try{
        if(!resetPasswordToken) {
            res.status(400).json({
                status: 'failed',
                errorMessage: "Please provide a valid token"
            })
            return
        }
        
        const user = await User.findOne({
            resetPasswordToken :resetPasswordToken ,
            resetPasswordExpire : { $gt: Date.now() }
        })
        if(!user) {
            res.status(400).json({
                status: 'failed',
                errorMessage: "Invalid token or Session Expired"
            })
            return
        }
        
        user.password = newPassword ; 
        
        user.resetPasswordToken = undefined 
        user.resetPasswordExpire = undefined
        
        await user.save() ; 
        
        return res.status(200).json({
            success : 'success' ,
            message : "Reset Password successfull"
        })
        
    }catch(err){
        res.status(500).json({
            status: 'failed',
            errorMessage: `internal server error`
        })
    }
    })
const confirmEmailAndSignUp = catchAsync(async(req, res, next) => {
    const hashedToken = crypto.createHash('shake256').update(req.params.token).digest('hex')
    //1  get user based on token

    const user = await User.findOne({ 
       verificationToken: hashedToken,
       verificationTokenExpires: { $gt: Date.now() }
    })
    if(!user){
       res.status(400).json({
           status: 'failed',
           errorMessage: `this token is invalid or has expired`
    })
    return
   }
    //2 set verify user status to confirmed 
    user.emailStatus = 'confirmed'
    user.verificationToken = undefined
    user.verificationTokenExpires = undefined
    await user.save()
    
    try{
   //send welcome email to new user
   new Email(user, `${process.env.URL}/addstory`).sendWelcome()
   res.status(200).json({
       message: `Hi,\n
       Your email has been confirmed, and your account has been successfully created. You can now proceed to the dashboard.`,
   }) 
   return
} catch(e){
        res.status(404).json({
            status: 'failed',
            message: e.message
        })

}})
const resendVerificationToken = catchAsync(async(req, res, next) => {
    const hashedToken = crypto.createHash('shake256').update(req.params.token).digest('hex')
    const user = await User.findOne({ 
        verificationToken: hashedToken,
     })
     if(!user){
        res.status(400).json({
            status: 'failed',
            errorMessage: 'This token is associated with an account that has already been verified or was not generated by us. If you received this token from us, please proceed to log in.'
     })
     return
    }
    const verificationToken = user.createToken()
    await user.save()
    await new Email(user, verificationToken).sendConfirmEmail()
    res.status(200).json({
        status: "success",
        message: "An email has been sent to your inbox for verification. Please proceed to verify your email.",
      });
 })
 
module.exports ={
    register,
    login,
    resetpassword,
    forgotpassword,
    getPrivateData,
    confirmEmailAndSignUp,
    resendVerificationToken
}