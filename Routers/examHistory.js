const express = require('express');
const router = express.Router();
const { createExamHistory, getExamHistoryByUsername, getExamHistoryById, deleteExamHistoryById, getUserAnalytics, getHighlightedQuestions} = require('../Controllers/examHistory');
const examHistoryController = require('../Controllers/examHistory');

// Create a new exam history record
router.post('/', createExamHistory);

// Get all exam history records
router.get('/', getExamHistoryByUsername);

// Get all exam history by its id
router.get('/:id', getExamHistoryById);

// Delete a specific exam history record by ID
router.delete('/:id', deleteExamHistoryById);

router.get('/analytics/:username', getUserAnalytics);
router.get('/highlights/:username', getHighlightedQuestions);

module.exports = router;
