const ExamHistory = require('../Models/examHistory');

// Controller to create a new exam history record
const createExamHistory = async (req, res) => {
  try {
    const { username, exam, totalScore, totalQuestions, subjectScores, image, questions } = req.body;

    
    const newExamHistory = new ExamHistory({
      username,
      exam,
      image,
      totalScore,
      totalQuestions,
      subjectScores,
      questions
    });

    const savedExamHistory = await newExamHistory.save();
    res.status(201).json(savedExamHistory);
  } catch (error) {
    console.error('Error creating exam history:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Controller to get all exam history records
const getAllExamHistory = async (req, res) => {
  try {
    const examHistoryList = await ExamHistory.find();
    res.status(200).json(examHistoryList);
  } catch (error) {
    console.error('Error getting exam history:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Controller to get a specific exam history record by ID
const getExamHistoryByUsername = async (req, res) => {
  try {
    const { username, page } = req.query;
    console.log(req.query);
    // page = parseInt(page) || 1;
    const pageSize = 10;
    const examCount = await ExamHistory.countDocuments()
    const maxPages = Math.ceil(examCount / pageSize)
    console.log('maxpages:', maxPages, 'page:', page, 'username:', username, 'examCount:', examCount );
    
    if(page - 1 > maxPages){
      return res.status(404).json({
        errorMessage: 'max-pages exceeded'
      })
    }

    const examHistory = await ExamHistory.find({ username: username })
    .sort({ timestamp: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize);
    console.log(examHistory);
    if (!examHistory || examHistory.length === 0) {
      return res.status(404).json({ error: 'Exam history not found' });
    }

    res.status(200).json({ examHistory, maxPages });
  } catch (error) {
    console.error('Error getting exam history by ID:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};



// Controller to delete a specific exam history record by ID
const deleteExamHistoryById = async (req, res) => {
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

module.exports = {getAllExamHistory, createExamHistory, getExamHistoryByUsername, deleteExamHistoryById}