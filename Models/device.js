const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fcmToken: {
    type: String,
    required: true,
    unique: true
  },
  deviceType: {
    type: String,
    required: true
  },
  os: String,
  appVersion: String,
  uniqueIdentifier: {
    type: String,
    required: true
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Device', deviceSchema);