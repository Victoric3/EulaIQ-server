const mongoose = require('mongoose');

const examHistorySchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  exam: {
    type: String,
    required: true,
  },
  totalScore: {
    type: Number,
    required: true,
  },
  totalQuestions: {
    type: Number,
    required: true,
  },
  subjectScores: {
    type: Object,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  
});

const ExamHistory = mongoose.model('ExamHistory', examHistorySchema);

module.exports = ExamHistory;
