const express = require('express')
const { getAccessToRoute } = require("../Middlewares/Authorization/auth");
const { handleImageandFileUpload } = require("../Helpers/Libraries/handleUpload");
const {createCustomExam, getCustomExam, getAllCustomExams} = require('../Controllers/exam')


const router = express.Router();

router.post('/createExam', getAccessToRoute, handleImageandFileUpload, createCustomExam)
router.get('/getExam/:examId', getAccessToRoute, getCustomExam)
router.get('/getExam', getAccessToRoute, getAllCustomExams)

module.exports = router