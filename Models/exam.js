const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
    name: {
      type: String,
      unique: true,
      required: true
    },
    type: {
      type: String,
      default: ''
    },
    difficulty: {
      type: String,
      default: 'not specified'
    },
    description: {
      type: String,
      default: 'no description for this exam'
    },
    duration: {
      type: String,
      default: 'no duration set'
    },
    category: String,
    grade: String,
    image: String,
    date: {
      type: Date,
      default: new Date()
    },
    author: {
      _id: {
          type: mongoose.Schema.ObjectId,
          ref: "User",
          required: true
      },
      username: String,
      photo: String
  },
    questions: [{
      examBody: {
        type: String,
        default: "king's heart",
      },
      examClass: {
        type: String,
        default: "All grades",
      },
      Institution: {
        type: String,
        default: "kingsheart",
      },
      course: {
        type: String,
        required: true,
      },
      topic: {
        type: String,
        required: true,
      },
      difficulty: {
        type: String,
        required: true,
      },
      question: {
        type: String,
        required: true,
      },
      options: {
        type: [String], // Options will be an array of strings
        required: true,
      },
      correctOption: {
        type: String,
        required: true,
      },
      explanation: {
        type: String,
        default: "no official explanation is available at this time",
      },
      image: {
        type: String,
        default: null,
      },
    }],
  });
  
  const Exam = mongoose.model('Exam', examSchema);

  module.exports= Exam