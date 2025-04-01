const asyncErrorWrapper = require("express-async-handler")
const Story = require("../Models/story");
const Comment = require("../Models/comment");
const mongoose = require('mongoose');

const addNewCommentToStory = async (req, res, next) => {
  try {
    const { storyid } = req.params; // Changed from slug to storyid
    const { content, parentCommentId } = req.body; // Removed star field

    // Find by ID instead of slug
    const story = await Story.findById(storyid);
    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found"
      });
    }

    const parentComment = parentCommentId
      ? await Comment.findById(parentCommentId)
      : null;

    const comment = await Comment.create({
      story: story._id,
      content: content,
      author: {
        _id: req.user.id,
        username: req.user.username,
        photo: req.user.photo
      },
      // star field removed as ratings are handled separately
      parentComment: parentComment
    });

    if (parentComment) {
      // If it's a reply, associate the comment with the parent comment
      parentComment.replies.push(comment._id);
      await parentComment.save();
    } else {
      // If it's a top-level comment, associate it with the story
      story.comments.push(comment._id);
      await story.save();
    }

    return res.status(200).json({
      success: true,
      data: comment
    });
  } catch (error) {
    console.error("Error in addNewCommentToStory:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add comment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

const getRepliesForComment = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 3; // Accept pageSize from request
    const { commentId } = req.params;
    
    // Rest of the function remains the same
    const parentComment = await Comment.findById(commentId).lean();

    if (!parentComment) {
      return res.status(404).json({
        success: false,
        message: `Parent comment with ID ${commentId} not found.`
      });
    }

    const maxPages = Math.ceil((parentComment.replies?.length || 0) / pageSize);
    if (page > maxPages && maxPages > 0) {
      return res.status(404).json({
        success: false,
        message: 'Max pages exceeded'
      });
    }

    // Fetch the replies using the IDs stored in the parent comment's 'replies' array
    const replyIds = parentComment.replies || [];
    const replies = await Comment.find({ _id: { $in: replyIds } })
      .sort({ createdAt: -1, _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    return res.status(200).json({
      success: true,
      data: replies,
      pagination: {
        currentPage: page,
        totalPages: maxPages,
        totalReplies: replyIds.length
      }
    });
  } catch (error) {
    console.error('Error fetching replies:', error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch replies",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

const getAllCommentByStory = async (req, res, next) => {
  try {
    const { storyid } = req.params; // Changed from slug to storyid
    const page = parseInt(req.query.page) || 1;
    const pageSize = 15;

    // Find by ID instead of slug
    const story = await Story.findById(storyid).lean();
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    const totalCommentCount = await Comment.countDocuments({
      story: story._id
    });
    
    const maxPages = Math.ceil(totalCommentCount / pageSize);
    if (page > maxPages && maxPages > 0) {
      return res.status(404).json({
        success: false,
        message: 'Max pages exceeded'
      });
    }

    const commentList = await Comment.find({
      story: story._id,
      parentComment: null
    })
      .sort({ createdAt: -1, _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    return res.status(200).json({
      success: true,
      count: totalCommentCount,
      data: commentList,
      pagination: {
        currentPage: page,
        totalPages: maxPages
      }
    });
  } catch (error) {
    console.error("Error in getAllCommentByStory:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch comments",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

const commentLike = async (req, res, next) => {
  const { commentId } = req.params;
  const userId = req.user._id;
  const MAX_RETRIES = 3;
  let retryCount = 0;

  async function attemptUpdate() {
    try {
      // Use lean() for faster query and only select what's needed
      const comment = await Comment.findById(commentId)
        .select("likes likeCount __v")
        .lean();

      if (!comment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found"
        });
      }

      // Check if user has already liked the comment
      const hasLiked = comment.likes.some(
        (id) => id.toString() === userId.toString()
      );

      // Use findOneAndUpdate with version key check
      const updatedComment = await Comment.findOneAndUpdate(
        {
          _id: commentId,
          __v: comment.__v // Version check
        },
        [
          {
            $set: {
              likes: {
                $cond: {
                  if: { $eq: [hasLiked, true] },
                  then: {
                    $filter: {
                      input: "$likes",
                      cond: { $ne: ["$$this", userId] },
                    }
                  },
                  else: {
                    // Ensure we don't add duplicate likes
                    $cond: {
                      if: { $in: [userId, "$likes"] },
                      then: "$likes",
                      else: { $concatArrays: ["$likes", [userId]] }
                    }
                  }
                }
              }
            }
          },
          {
            $set: {
              likeCount: { $size: "$likes" },
              __v: { $add: ["$__v", 1] } // Increment version
            }
          }
        ],
        {
          new: true,
          runValidators: true
        }
      )
        .select("likeCount likes")
        .lean();

      if (!updatedComment && retryCount < MAX_RETRIES) {
        retryCount++;
        return await attemptUpdate();
      }

      if (!updatedComment) {
        return res.status(409).json({
          success: false,
          message: "Concurrent update detected. Please try again."
        });
      }

      // Determine the CURRENT like status after the update
      const currentLikeStatus = updatedComment.likes.some(
        id => id.toString() === userId.toString()
      );

      return res.status(200).json({
        success: true,
        data: {
          _id: updatedComment._id,
          likeCount: updatedComment.likeCount
        },
        likeStatus: currentLikeStatus
      });
    } catch (error) {
      if (error.name === "VersionError" && retryCount < MAX_RETRIES) {
        retryCount++;
        return await attemptUpdate();
      }

      console.error("Error in commentLike:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  }

  return attemptUpdate();
};

const getCommentLikeStatus = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    const comment = await Comment.findById(commentId)
      .select("likes")
      .lean();
      
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found"
      });
    }

    const likeStatus = comment.likes.some(
      (id) => id.toString() === userId.toString()
    );

    return res.status(200).json({
      success: true,
      likeStatus: likeStatus
    });
  } catch (error) {
    console.error("Error in getCommentLikeStatus:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get like status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

module.exports = {
  addNewCommentToStory,
  getAllCommentByStory,
  commentLike,
  getCommentLikeStatus,
  getRepliesForComment
};