const crypto = require("crypto")

const mongoose = require("mongoose")

const bcrypt = require("bcryptjs")

const jwt = require("jsonwebtoken")

const UserSchema = new mongoose.Schema({

    username : {
        type :String,
        required : [true ,"Please provide a username"]
    },
    photo : {
        type : String,
        default : "user.png"
    },
    email : {
        type: String ,
        required : [true ,"Please provide an email"],
        unique : true ,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
    },
    emailStatus : {
        type: String,
        default: 'pending',
    },
    password : {
        type:String,
        minlength: [6, "Please provide a password with min length : 6 "],
        required: [true, "Please provide a password"],
        select: false
    },
    role: {
        type: String,
        default: "user",
        enum: ["user", "admin"]
    },
    verificationToken : {
        type: String,
        default: ""
    },
    verificationTokenExpires : {
        type: Number,
        default: -1
    },
    readList : [{
        type : mongoose.Schema.ObjectId, 
        ref : "Story"
    }],
    readListLength: {
        type: Number,
        default: 0
    },
    resetPasswordToken : String ,
    resetPasswordExpire: Date 


},{timestamps: true})


UserSchema.pre("save" , async function (next) {

    if (!this.isModified("password")) {
        next()
    }

    const salt = await bcrypt.genSalt(10)

    this.password = await bcrypt.hash(this.password,salt)
    next() ;

})


UserSchema.methods.generateJwtFromUser  = function(){
    
    const { JWT_SECRET_KEY,JWT_EXPIRE } = process.env;

    payload = {
        id: this._id,
        username : this.username,
        email : this.email
    }

    const token = jwt.sign(payload ,JWT_SECRET_KEY, {expiresIn :JWT_EXPIRE} )

    return token 
}

UserSchema.methods.getResetPasswordTokenFromUser =function(){

    const { RESET_PASSWORD_EXPIRE } = process.env

    const randomHexString = crypto.randomBytes(20).toString("hex")

    const resetPasswordToken = crypto.createHash("SHA256").update(randomHexString).digest("hex")

    this.resetPasswordToken = resetPasswordToken
    
    this.resetPasswordExpire =Date.now()+ parseInt(RESET_PASSWORD_EXPIRE)

    return resetPasswordToken
}

UserSchema.methods.createToken = function(){
    const verificationToken = crypto.randomBytes(32).toString('hex')
    //hash the reset token

    this.verificationToken = crypto.createHash('shake256').update(verificationToken).digest('hex')
    this.verificationTokenExpires = Date.now() + 20 * 60 * 1000;
    return verificationToken
}

const User = mongoose.model("User",UserSchema)

module.exports = User  ;