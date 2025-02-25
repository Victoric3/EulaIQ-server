const crypto = require("crypto")

const mongoose = require("mongoose")

const bcrypt = require("bcryptjs")

const jwt = require("jsonwebtoken")

const dotenv = require("dotenv")
dotenv.config({ path: './config.env' });

const UserSchema = new mongoose.Schema({
    firstname: String,
    lastname: String,
    birthdate: {
        type: String,
        default: 'Not available'
      },
      interests: {
        type: [String],
        default: [
          "SystemChoice",
        ],
      },
      isAnonymous: {
        type: Boolean,
        default: false
      },
      anonymousId: {
        type: String,
        sparse: true,
        index: true
      },
      accountType: {
        type: String,
        enum: ['anonymous', 'registered', 'converted'],
        default: 'registered'
      },
    grade: String,
    temporary: {
        type: Boolean,
        default: false
    },
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
        default: []
    },
    deviceInfo: {
        type: [Object],
        required: true
    },
    resetPasswordToken : String ,
    resetPasswordExpire: Date,
    tokenVersion: {
        type: Number,
        default: 0
    },
    sessions: [{
        token: String,
        device: String,
        lastActive: Date,
        expiresAt: Date,
        ipAddress: String
    }],
    validTokens: [String],
    maxSessions: {
        type: Number,
        default: 5
    },
    passwordHistory: {
        type: [String],
        select: false,
        default: []
    }
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

// Add password history methods
UserSchema.methods.isPasswordPreviouslyUsed = async function(newPassword) {
  const user = await this.model('User').findById(this._id).select('+passwordHistory');
  if (!user.passwordHistory) return false;
  
  for (const oldPassword of user.passwordHistory) {
    if (await bcrypt.compare(newPassword, oldPassword)) {
      return true;
    }
  }
  return false;
};

// Add session management methods
UserSchema.methods.addSession = async function(sessionData) {
  this.sessions = this.sessions || [];
  
  // Remove expired sessions
  this.sessions = this.sessions.filter(session => 
    session.expiresAt > Date.now()
  );
  
  // Check max sessions
  if (this.sessions.length >= this.maxSessions) {
    this.sessions.shift(); // Remove oldest session
  }
  
  this.sessions.push({
    ...sessionData,
    lastActive: new Date(),
    expiresAt: new Date(Date.now() + 24*60*60*1000) // 24 hours
  });
};

UserSchema.methods.validateSession = function(token) {
  return this.validTokens && this.validTokens.includes(
    crypto.createHash('sha256').update(token).digest('hex')
  );
};

UserSchema.methods.cleanupSessions = async function() {
  const now = Date.now();
  const hadExpired = this.sessions.some(session => session.expiresAt <= now);
  
  if (hadExpired) {
    this.sessions = this.sessions.filter(session => session.expiresAt > now);
    this.validTokens = this.validTokens.filter(token => {
      return this.sessions.some(session => session.token === token);
    });
    await this.save();
  }
  return hadExpired;
};

// Add pre-find middleware to clean sessions
UserSchema.pre('find', async function() {
  const users = await this.model.find(this.getQuery());
  for (const user of users) {
    await user.cleanupSessions();
  }
});

const User = mongoose.model("User",UserSchema)

module.exports = User  ;