const express = require("express")
const router = express.Router();
const { getQuestion } = require('../Controllers/question')
const authController = require('../Middlewares/Authorization/auth')

router.post('/getQuestion', authController.getAccessToRoute, authController.apiLimiter, getQuestion)


module.exports = router