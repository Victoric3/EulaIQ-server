const express = require("express")

const { validateSession } = require("../Middlewares/Authorization/auth");

const { 
    addNewCommentToStory,
    getAllCommentByStory,
    commentLike,
    getCommentLikeStatus, 
    getRepliesForComment
} = require("../Controllers/comment")

// const { checkStoryExist } = require("../Middlewares/database/databaseErrorhandler");

const router = express.Router() ;


router.post("/:storyid/addComment", validateSession ,addNewCommentToStory)

router.get("/:storyid/getAllComment",getAllCommentByStory)

router.get("/:commentId/replies",getRepliesForComment)

router.post("/:commentId/like", validateSession, commentLike)

router.post("/:commentId/getCommentLikeStatus", validateSession, getCommentLikeStatus)


module.exports = router