const mongoose = require("mongoose");

// Define the schema for the audio model
const audioCollectionSchema = new mongoose.Schema({
  imageUrl: {
    type: String,
    default: "",
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  audios: {
    type: [Object],
    default: [],
  },
  date: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  type: {
    type: String,
    enum: ["added", "generated"],
    default: "generated",
  },
  access: {
    type: String,
    enum: ["private", "public"],
    default: "public",
  },
  textChunks: {
    type: [String],
    required: true,
  },
  playtime: {
    type: Number,
    default: 0,
  },
  playCount: {
    type: Number,
    default: 0,
  },
  rating: {
    type: Number,
    default: 5,
  },
  likes: [
    {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
  ],
  likeCount: {
    type: Number,
    default: 0,
  },
  comments: [
    {
      type: mongoose.Schema.ObjectId,
      ref: "Comment",
    },
  ],
  commentCount: {
    type: Number,
    default: 0,
  },
});

// Create the audio model
const AudioCollection = mongoose.model(
  "AudioCollection",
  audioCollectionSchema
);

module.exports = AudioCollection;
