const asyncErrorWrapper = require("express-async-handler")
const Story = require("../Models/story");
const Comment = require("../Models/comment");
const mongoose = require('mongoose');

const addNewCommentToStory  =asyncErrorWrapper(async(req,res,next)=> {

    const {slug} = req.params 

    const {star , content, parentCommentId} =req.body 

    const story = await Story.findOne({slug :slug })

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
    star: star,
    parentComment: parentComment, // Assign the parent comment
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
        success :true, 
        data : comment 
    })

})

const getRepliesForComment = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const pageSize = 15;
      const { commentId } = req.params
      // Find the comment by its ID
      const parentComment = await Comment.findById(commentId)

      if (!parentComment) {
        // Handle the case where the parent comment is not found
        return res.status(404).json({message: `Parent comment with ID ${commentId} not found.`});
      }
      const maxPages = parentComment.replies.length/pageSize
      if(page - 1 > maxPages){
        return res.status(404).json({success: false, errorMessage: 'max pages exceeded'})
      }
  
      // Fetch the replies using the IDs stored in the parent comment's 'replies' array
      const replyIds = parentComment.replies || [];
      const replies = await Comment.find({ _id: { $in: replyIds } })
      .sort({createdAt: -1, _id: 1})
      .skip((page - 1) * pageSize)
      .limit(pageSize);
      if(replies.length > 0){
          res.status(200).json({replies});
      }else{
        res.status(201).json({})
      }
    } catch (error) {
      console.error('Error fetching replies:', error);
      throw error; // Propagate the error to the calling function
    }
  };

const getAllCommentByStory = asyncErrorWrapper(async(req, res, next) => {

    const { slug } = req.params
    const page = parseInt(req.query.page) || 1;
    const pageSize = 15;
    
    const story = await Story.findOne({slug:slug})
    if(!story){
      res.status(404).json({
        success: 'false',
        errorMessage: 'story not found'
      })
    }
    const maxPages = story.comments.length/pageSize
    if(page - 1 > maxPages){
      return res.status(404).json({success: false, errorMessage: 'max pages exceeded'})
    }
    const commmentList = await Comment.find({
       story: story._id,
       parentComment: null 
    }).sort({createdAt: -1, _id: 1})
      .skip((page - 1) * pageSize)
      .limit(pageSize);

    const totalCommentCount = await Comment.countDocuments({
      story: story._id
  });

    return res.status(200)
        .json({
            success: true,
            count: totalCommentCount,
            data: commmentList
        })

})

const commentLike = asyncErrorWrapper(async(req, res, next) => {

    const { activeUser} =  req.body 
    const { comment_id} =  req.params 


    const comment = await Comment.findById(comment_id)

    if (!comment.likes.includes(activeUser._id)) {

        comment.likes.push(activeUser._id)
        comment.likeCount = comment.likes.length ;

        await comment.save()  ;

    }
    else {

        const index = comment.likes.indexOf(activeUser._id)
        comment.likes.splice(index, 1)
        comment.likeCount = comment.likes.length
        await comment.save()  ;
    }

    const likeStatus = comment.likes.includes(activeUser._id)
    
    return res.status(200)
        .json({
            success: true,
            data : comment,
            likeStatus:likeStatus
        })

})

const getCommentLikeStatus = asyncErrorWrapper(async(req, res, next) => {

    const { activeUser} =  req.body 
    const { comment_id} =  req.params 

    const comment = await Comment.findById(comment_id)
    const likeStatus = comment.likes.includes(activeUser._id)

    return res.status(200)
    .json({
        success: true,
        likeStatus:likeStatus
    })

})

module.exports ={
    addNewCommentToStory,
    getAllCommentByStory,
    commentLike,
    getCommentLikeStatus,
    getRepliesForComment
}