const express = require("express")
const router = express.Router() ;
const { getChannelData } = require('../Controllers/youtubeDataAnal')

router.post('/', getChannelData)

module.exports = router