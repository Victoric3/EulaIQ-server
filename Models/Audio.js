const mongoose = require('mongoose');

// Define the schema for the audio model
const audioSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  audioUrl: {
    type: String,
    required: true
  },
  audioCollection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AudioCollection'
  },
  date: {
    type: Date,
    default: Date.now
}
});

// Create the audio model
const Audio = mongoose.model('Audio', audioSchema);

module.exports = Audio;
