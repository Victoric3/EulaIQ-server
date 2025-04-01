const express = require("express");
const router = express.Router();
const {
  getQuestion,
  handleQuestionGeneration,
  continueQuestionGeneration,
  fetchExamData,
  getQuestionsByPriority,
  getEbookQuestionsSummary, 
  getQuestionGenerationStatus
} = require("../Controllers/question");
const { validateSession } = require("../Middlewares/Authorization/auth");

router.get("/getQuestion", validateSession, getQuestion);
router.post("/generateQuestion", validateSession, handleQuestionGeneration);
router.get('/status/:ebookId', validateSession, getQuestionGenerationStatus);
router.post("/fetchExamData", validateSession, fetchExamData);
router.post(
  "/continueQuestionGeneration",
  validateSession,
  continueQuestionGeneration
);
router.get("/exam/:examId/priority", validateSession, getQuestionsByPriority);
router.get('/:ebookId', getEbookQuestionsSummary);

module.exports = router;
