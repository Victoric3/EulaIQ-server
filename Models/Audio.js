const mongoose = require("mongoose");

// Define the schema for the audio model
const audioSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  text: {
    type: String,
  },
  audioUrl: {
    type: String,
    required: true,
  },
  audioDuration: {
    type: Number,
    required: true,
  },
  audioCollection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AudioCollection",
  },
  date: {
    type: Date,
    default: Date.now,
  },
  index: {
    type: Number,
    required: true,
  },
  voice: {
    type: String,
    default: "default voice",
  },
  type: {
    type: String,
    default: "head",
  },
  segments: {
    type: [{
      url: String,
      voice: String, 
      duration: Number,
      text: String
    }],
    default: []
  }
});

// Create the audio model
const Audio = mongoose.model("Audio", audioSchema);

module.exports = Audio;
