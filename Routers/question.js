const express = require("express")
const router = express.Router();
const { getQuestion, handleQuestionGeneration, continueQuestionGeneration, fetchExamData } = require('../Controllers/question')
const authController = require('../Middlewares/Authorization/auth')
const {
    handleImageUpload,
    handleFileUpload,
  } = require("../Helpers/Libraries/handleUpload");

router.get('/getQuestion', authController.getAccessToRoute, authController.apiLimiter, getQuestion)
router.post('/generateQuestion', authController.getAccessToRoute, handleFileUpload, handleQuestionGeneration)
router.post('/fetchExamData', authController.getAccessToRoute, fetchExamData)
router.post('/continueQuestionGeneration', authController.getAccessToRoute, continueQuestionGeneration)


module.exports = router