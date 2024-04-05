const mongoose = require('mongoose');

// Define the schema for the authorization token model
const authorizationTokenSchema = new mongoose.Schema({
  audioCollection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AudioCollection',
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  expirationDate: {
    type: Date,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
}
});

// Create the authorization token model
const AuthorizationToken = mongoose.model('AuthorizationToken', authorizationTokenSchema);

module.exports = AuthorizationToken;
