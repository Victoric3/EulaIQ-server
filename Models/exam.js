const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  name: {
    type: String,
    unique: true,
    required: true
  },
  // Add these fields
  associatedEbook: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Story"
  },
  status: {
    type: String,
    enum: ['processing', 'complete', 'error'],
    default: 'processing'
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  retryCount: {
    type: Number,
    default: 0
  },
  processingStatus: {
    type: String,
    default: ''
  },
  startTime: {
    type: Date
  },
  endTime: {
    type: Date
  },
  error: {
    type: String
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
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
  },
  textChunks: {
    type: [String],
    default: []
  },
  questions: [{
    examBody: {
      type: String,
      default: "EulaIQ",
    },
    examClass: {
      type: String,
      default: "All grades",
    },
    Institution: {
      type: String,
      default: "EulaIQ",
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
      type: [String],
      default: [],
    },
    correctOption: {
      type: String,
      required: true,
    },
    explanation: {
      type: String,
      default: "no official explanation is available at this time",
    },
    reference: {
      type: String,
      default: "No reference was provided for this material",
    },
    navigationReference: {
      sectionTitle: String
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
    image: {
      type: String,
      default: null,
    },
  }],
});

const Exam = mongoose.model('Exam', examSchema);

module.exports = Exam