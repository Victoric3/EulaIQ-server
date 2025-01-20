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
    content: {
      type: [String],
      required: [true, "Please provide content"],
      default: [],
    },
    contentTitles: {
      type: [{
        title: String,
        type: String,
        page: Number
      }],
      default: []
    },
    fileUrl: {
      type: String,
      default: "none",
    },
    contentCount: {
      type: Number,
      default: 0,
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
    free: {
      type: Boolean,
      default: false,
    },
    prizePerChapter: {
      type: Number,
      default: 5,
    },
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
  return slugify(this.title, {
    replacement: "-",
    remove: /[*+~.()'"!:@/?]/g,
    lower: true,
    strict: false,
    locale: "tr",
    trim: true,
  });
};

StorySchema.methods.updateRating = function (newRating) {
  const totalRating = this.averageRating * this.ratingCount;
  this.ratingCount += 1;
  this.averageRating = (totalRating + newRating) / this.ratingCount;
  return this.save();
};

const Story = mongoose.model("Story", StorySchema);

module.exports = Story;
