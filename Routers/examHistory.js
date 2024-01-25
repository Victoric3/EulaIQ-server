const express = require('express');
const router = express.Router();
const { createExamHistory, getExamHistoryByUsername, deleteExamHistoryById} = require('../Controllers/examHistory');

// Create a new exam history record
router.post('/', createExamHistory);

// Get all exam history records
// router.get('/', getAllExamHistory);
router.get('/', getExamHistoryByUsername);

// Delete a specific exam history record by ID
router.delete('/:id', deleteExamHistoryById);

module.exports = router;
