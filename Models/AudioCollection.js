const mongoose = require('mongoose');

// Define the schema for the audio model
const audioCollectionSchema = new mongoose.Schema({
  imageUrl: {
    type: String,
    default: ""
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  audios: {
    type: [Object],
    default: []
  },
  date: {
    type: Date,
    default: Date.now
},
  createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
  }
});

// Create the audio model
const AudioCollection = mongoose.model('AudioCollection', audioCollectionSchema);

module.exports = AudioCollection;
