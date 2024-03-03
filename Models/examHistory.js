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
  image: {
    type: String,
    default: 'https://i.ibb.co/jW28jQX/30531dedea3d.jpg',
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
  questions: {
    type: Object,
    default: {}
  }
  
});

const ExamHistory = mongoose.model('ExamHistory', examHistorySchema);

module.exports = ExamHistory;
