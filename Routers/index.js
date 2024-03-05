const express = require("express")

const router = express.Router()

const authRoute = require("./auth")
const storyRoute = require("./story")
const userRoute = require("./user")
const commentRoute = require("./comment")
const questionRoute = require('./question')
const examHistoryRoute = require('./examHistory')
const sitemapRoute = require('./sitemapRouter')
const searchSuggestionRoute = require('./searchSuggestions')
const examRoute = require('./exam')
const youtubeDataAnal = require('./youtubeDataAnal')

router.use("/auth",authRoute)
router.use("/story",storyRoute)
router.use("/user",userRoute)
router.use("/comment",commentRoute)
router.use("/question", questionRoute)
router.use("/examHistory", examHistoryRoute)
router.use("/", sitemapRoute)
router.use("/search", searchSuggestionRoute)
router.use("/exam", examRoute)
router.use("/youtube", youtubeDataAnal)

module.exports = router