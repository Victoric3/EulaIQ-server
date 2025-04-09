const mongoose = require('mongoose');

const examHistorySchema = new mongoose.Schema({
  username: {
    type: String,
    required: true
  },
  exam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: false
  },
  examName: {
    type: String
  },
  examType: {
    type: String,
    enum: ['regular', 'practice'],
    default: 'regular'
  },
  totalScore: {
    type: Number,
    required: true
  },
  totalQuestions: {
    type: Number,
    required: true
  },
  timeSpent: {
    type: Number,
    default: 0
  },
  deviceInfo: {
    type: Object,
    default: {}
  },
  image: {
    type: String
  },
  subjectScores: {
    type: Object,
    default: {}
  },
  questions: [{
    question: String,
    options: [String],
    correctOption: String,
    userAnswer: String,
    isCorrect: Boolean,
    topic: String,
    difficulty: String,
    explanation: {
      type: String,
      default: "no official explanation is available at this time",
    },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium'
    },
    relevanceScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    },
    examFrequency: {
      type: String,
      enum: ['very common', 'common', 'uncommon', 'rare'],
      default: 'common'
    },
    conceptCategory: {
      type: String,
      default: 'general'
    },
    navigationReference: {
      sectionTitle: String
    },
    isHighlighted: {
      type: Boolean,
      default: false
    },
    timeSpentOnQuestion: {
      type: Number,
      default: 0
    },
    confidence: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium'
    }
  }],
  topicPerformance: {
    type: Object,
    default: {}
  },
  difficultyBreakdown: {
    type: Object,
    default: {}
  },
  conceptCategoryBreakdown: {
    type: Object,
    default: {}
  },
  performanceSummary: {
    type: Object,
    default: null
  },
  highlightedQuestions: [{
    questionId: mongoose.Schema.Types.ObjectId,
    question: String,
    topic: String,
    difficulty: String,
    userAnswer: String,
    correctOption: String,
    isCorrect: Boolean
  }],
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const ExamHistory = mongoose.model('ExamHistory', examHistorySchema);

module.exports = ExamHistory;
