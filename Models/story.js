const mongoose = require("mongoose");
const Comment = require("./comment");
const slugify = require("slugify");

const StorySchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    slug: String,
    title: {
      type: String,
      required: [true, "Please provide a title"],
      // unique: true,
      // minlength: [4, "Please provide a title of at least 4 characters"],
    },
    description: {
      type: String,
      required: [true, "Please provide a description"],
      minlength: [50, "Please provide a description of at least 50 characters"],
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    fileUrl: {
      type: String,
      default: "none",
    },
    tags: {
      type: [String],
      default: ["general"],
    },
    summaries: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "Summary",
        required: true,
      },
    ],
    audioCollections: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "AudioCollection",
        required: true,
      },
    ],
    questions: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "Question",
        required: true,
      },
    ],
    image: {
      type: String,
      default: "default.jpg",
    },
    readTime: {
      type: [Number],
      default: [0],
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
    ratings: [
      {
        user: {
          type: mongoose.Schema.ObjectId,
          ref: "User",
          required: true,
        },
        rating: {
          type: Number,
          required: true,
          min: 1,
          max: 5,
        },
      },
    ],
    averageRating: {
      type: Number,
      default: 0,
    },
    ratingCount: {
      type: Number,
      default: 0,
    },
    pendingContent: {
      type: String,
      default: '',
    },
    pendingSectionInfo: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    contentTitles: {
      type: [{
        title: { type: String },
        type: { type: String },
        page: { type: Number }
      }],
      default: []
    },
    contentCount: {
      type: Number,
      default: 0
    },
    currentPage: {
      type: Number,
      default: 0
    },
    sections: [{
      title: { type: String },
      content: { type: String },
      type: { type: String, enum: ['head', 'sub'] },
      estimatedDuration: { type: Number },
      complete: { type: Boolean }
    }],
    status: {
      type: String,
      enum: ['pending', 'processing', 'complete', 'error'],
      default: 'pending'
    },
    processingError: String,
    processingProgress: {
      pagesProcessed: { type: Number, default: 0 },
      totalPages: { type: Number, default: 0 }
    },
    processingStatus: {
      type: String,
      enum: ['initializing', 'processing_pdf', 'extracting_content', 'organizing_sections', 'complete', 'failed'],
      default: 'initializing'
    },
    processingDetails: {
      currentStep: String,
      startTime: Date,
      lastUpdated: Date,
      estimatedTimeRemaining: Number, // in seconds
      retryCount: { type: Number, default: 0 },
      failedPages: [Number],
      processingLog: [{
        timestamp: Date,
        message: String,
        level: { type: String, enum: ['info', 'warning', 'error'] }
      }]
    }
  },
  { timestamps: true }
);

StorySchema.pre("save", async function (next) {
  this.commentCount = await Comment.countDocuments({
    story: this._id,
  });
  if (!this.isModified("title")) {
    next();
  }
  

  this.slug = this.makeSlug();

  next();
});

StorySchema.pre("remove", async function (next) {
  await Comment.deleteMany({
    story: this._id,
  });
  next();
});

StorySchema.methods.makeSlug = function () {
  // Get base slug from title
  const baseSlug = slugify(this.title, {
    replacement: "-",
    remove: /[*+~.()'"!:@/?]/g,
    lower: true,
    strict: false,
    locale: "tr",
    trim: true,
  });

  // Take the last 6 characters of the MongoDB ObjectId to make it unique
  // This gives us millions of possibilities for the same title
  const uniqueId = this._id.toString().slice(-6);
  
  // Combine the base slug with the unique identifier
  return `${baseSlug}-${uniqueId}`;
};

StorySchema.methods.updateRating = function (newRating) {
  const totalRating = this.averageRating * this.ratingCount;
  this.ratingCount += 1;
  this.averageRating = (totalRating + newRating) / this.ratingCount;
  return this.save();
};

StorySchema.methods.logProgress = async function(message, level = 'info') {
  const timestamp = new Date();
  
  // Initialize processing details if not exists
  this.processingDetails = this.processingDetails || {
    startTime: timestamp,
    processingLog: []
  };
  
  // Add log entry
  this.processingDetails.processingLog.push({
    timestamp,
    message,
    level
  });
  
  // Update progress fields
  this.processingDetails.lastUpdated = timestamp;
  
  // Limit log size to prevent document growth issues
  if (this.processingDetails.processingLog.length > 100) {
    this.processingDetails.processingLog = this.processingDetails.processingLog.slice(-100);
  }
  
  // Save only the modified fields for better performance
  return this.save();
};

StorySchema.methods.updateProcessingStatus = async function(status, currentStep, pagesProcessed) {
  this.processingStatus = status;
  this.processingDetails = this.processingDetails || {};
  this.processingDetails.currentStep = currentStep;
  this.processingDetails.lastUpdated = new Date();
  
  if (pagesProcessed !== undefined) {
    this.processingProgress.pagesProcessed = pagesProcessed;
    
    // Calculate estimated time remaining
    if (this.processingProgress.totalPages > 0 && this.processingDetails.startTime) {
      const elapsedTime = (Date.now() - this.processingDetails.startTime) / 1000; // seconds
      const percentComplete = pagesProcessed / this.processingProgress.totalPages;
      if (percentComplete > 0) {
        this.processingDetails.estimatedTimeRemaining = 
          (elapsedTime / percentComplete) * (1 - percentComplete);
      }
    }
  }
  
  return this.save();
};

const Story = mongoose.model("Story", StorySchema);

module.exports = Story;
