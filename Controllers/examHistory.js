const ExamHistory = require('../Models/examHistory');

// Controller to create a new exam history record
exports.createExamHistory = async (req, res) => {
  try {
    const { username, exam, totalScore, totalQuestions, subjectScores } = req.body;

    const newExamHistory = new ExamHistory({
      username,
      exam,
      totalScore,
      totalQuestions,
      subjectScores
    });

    const savedExamHistory = await newExamHistory.save();
    res.status(201).json(savedExamHistory);
  } catch (error) {
    console.error('Error creating exam history:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Controller to get all exam history records
exports.getAllExamHistory = async (req, res) => {
  try {
    const examHistoryList = await ExamHistory.find();
    res.status(200).json(examHistoryList);
  } catch (error) {
    console.error('Error getting exam history:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Controller to get a specific exam history record by ID
exports.getExamHistoryByUsername = async (req, res) => {
  try {
    const { username } = req.query;
    const examHistory = await ExamHistory.find({username: username});

    if (!examHistory) {
      return res.status(404).json({ error: 'Exam history not found' });
    }

    res.status(200).json(examHistory);
  } catch (error) {
    console.error('Error getting exam history by ID:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};


// Controller to delete a specific exam history record by ID
exports.deleteExamHistoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedExamHistory = await ExamHistory.findByIdAndDelete(id);

    if (!deletedExamHistory) {
      return res.status(404).json({ error: 'Exam history not found' });
    }

    res.status(200).json(deletedExamHistory);
  } catch (error) {
    console.error('Error deleting exam history by ID:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
