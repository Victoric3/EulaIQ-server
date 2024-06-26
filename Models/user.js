const crypto = require("crypto")

const mongoose = require("mongoose")

const bcrypt = require("bcryptjs")

const jwt = require("jsonwebtoken")

const dotenv = require("dotenv")
dotenv.config({ path: './config.env' });

const UserSchema = new mongoose.Schema({
    firstname: String,
    lastname: String,
    grade: String,
    temporary: Boolean,
    username : {
        type :String,
        required : [true ,"Please provide a username"]
    },
    photo : {
        type : String,
        default : "https://drive.google.com/uc?id=1RhzpswcIei9GQ1ecuhjkSRGJwIeWHHf1"
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
        enum: ["user", "admin", "employee"]
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
    audioCollections: {
        type: [Object],
        default: []
    },
    preferences: {
        type: [Object],
        default: []
    },
    location: {
        type: [Object],
        required: true
    },
    ipAddress: {
        type: [String],
        required: true
    },
    deviceInfo: {
        type: [Object],
        required: true
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

    const randomHexString = crypto.randomBytes(20).toString("hex")

    const resetPasswordToken = crypto.createHash("SHA256").update(randomHexString).digest("hex")

    this.resetPasswordToken = resetPasswordToken
    
    this.resetPasswordExpire = Date.now() + 1200000

    return resetPasswordToken
}

UserSchema.methods.createToken = function(){
    const verificationToken = Math.floor(100000 + Math.random() * 900000).toString()
    //hash the reset token

    this.verificationToken = crypto.createHash('shake256').update(verificationToken).digest('hex')
    this.verificationTokenExpires = Date.now() + 20 * 60 * 1000;
    return verificationToken
}

const User = mongoose.model("User",UserSchema)

module.exports = User  ;