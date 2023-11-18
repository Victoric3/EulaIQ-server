const express = require('express');
const router = express.Router();
const examHistoryController = require('../Controllers/examHistory');

// Create a new exam history record
router.post('/', examHistoryController.createExamHistory);

// Get all exam history records
// router.get('/', examHistoryController.getAllExamHistory);
router.get('/', examHistoryController.getExamHistoryByUsername);

// Delete a specific exam history record by ID
router.delete('/:id', examHistoryController.deleteExamHistoryById);

module.exports = router;
