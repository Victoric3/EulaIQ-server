const express = require("express")

const router = express.Router()

const authRoute = require("./auth")
const storyRoute = require("./story")
const userRoute = require("./user")
const commentRoute = require("./comment")
const questionRoute = require('./question')
const examHistoryRoute = require('./examHistory')

router.use("/auth",authRoute)
router.use("/story",storyRoute)
router.use("/user",userRoute)
router.use("/comment",commentRoute)
router.use("/question", questionRoute)
router.use("/examHistory", examHistoryRoute)


module.exports = router