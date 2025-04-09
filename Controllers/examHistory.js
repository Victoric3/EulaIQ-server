const ExamHistory = require("../Models/examHistory");
const { azureOpenai, processTextChunks } = require("../Helpers/Libraries/azureOpenai");
const { getSystemPrompt } = require("../Helpers/query/queryMapping");
const { mongoose } = require("mongoose");

// Controller to create a new exam history record with enhanced analytics
const createExamHistory = async (req, res) => {
  try {
    const {
      username,
      exam,
      totalScore,
      totalQuestions,
      subjectScores,
      image,
      questions,
      timeSpent,
      deviceInfo,
    } = req.body;

    // Enhanced analytics fields from questions
    const enhancedQuestions = questions.map(q => {
      // Determine if the answer is correct by comparing option text or index
      let isCorrect = false;
      
      if (q.userAnswer && q.options && q.correctOption) {
        // If userAnswer is a number or index string, compare directly with correctOption
        if (!isNaN(q.userAnswer) || (typeof q.userAnswer === 'string' && /^\d+$/.test(q.userAnswer))) {
          isCorrect = q.userAnswer.toString() === q.correctOption.toString();
        } 
        // If userAnswer is text, find its index and compare with correctOption
        else {
          const answerIndex = q.options.findIndex(
            option => option === q.userAnswer
          );
          isCorrect = answerIndex !== -1 && answerIndex.toString() === q.correctOption.toString();
        }
      }
      
      return {
        ...q,
        // Analytics-valuable fields to preserve
        topic: q.topic || 'General',
        difficulty: q.difficulty || 'Medium',
        priority: q.priority || 'medium',
        relevanceScore: q.relevanceScore || 50,
        examFrequency: q.examFrequency || 'common',
        conceptCategory: q.conceptCategory || 'general',
        navigationReference: q.navigationReference || {},
        isHighlighted: q.isHighlighted || false,
        timeSpentOnQuestion: q.timeSpentOnQuestion || 0,
        confidence: q.confidence || 'medium',
        explanation: q.explanation || "No explanation is available for this question",
        reference: q.reference || "No reference provided",
        // Ensure userAnswer is captured
        userAnswer: q.userAnswer || null,
        // Properly calculated isCorrect
        isCorrect: isCorrect
      };
    });

    // Calculate topic-wise performance
    const topicPerformance = {};
    enhancedQuestions.forEach(q => {
      const topic = q.topic || 'General';
      if (!topicPerformance[topic]) {
        topicPerformance[topic] = { 
          correct: 0, 
          total: 0, 
          score: 0,
          averageTimeSpent: 0,
          totalTimeSpent: 0
        };
      }
      
      topicPerformance[topic].total++;
      // Use the newly calculated isCorrect field
      if (q.isCorrect) {
        topicPerformance[topic].correct++;
      }
      
      if (q.timeSpentOnQuestion) {
        topicPerformance[topic].totalTimeSpent += q.timeSpentOnQuestion;
      }
    });

    // Calculate final scores and averages for topics
    Object.keys(topicPerformance).forEach(topic => {
      const topicData = topicPerformance[topic];
      topicData.score = topicData.total > 0 ? 
        Math.round((topicData.correct / topicData.total) * 100) : 0;
        
      topicData.averageTimeSpent = topicData.total > 0 ?
        Math.round(topicData.totalTimeSpent / topicData.total) : 0;
    });

    // Create the exam history data object
    const examHistoryData = {
      username,
      image,
      totalScore,
      totalQuestions,
      subjectScores,
      questions: enhancedQuestions,
      timeSpent,
      deviceInfo,
      topicPerformance,
      difficultyBreakdown: calculateDifficultyBreakdown(enhancedQuestions),
      conceptCategoryBreakdown: calculateConceptBreakdown(enhancedQuestions),
      performanceSummary: "Generating detailed analysis...", // Placeholder
      highlightedQuestions: enhancedQuestions
        .filter(q => q.isHighlighted)
        .map(q => ({
          questionId: q._id,
          question: q.question,
          topic: q.topic,
          difficulty: q.difficulty,
          userAnswer: q.userAnswer,
          correctOption: q.correctOption,
          // Use the already calculated isCorrect field
          isCorrect: q.isCorrect,
          explanation: q.explanation || "No explanation is available for this question"
        }))
    };

    // Check if exam is a valid ObjectId and handle appropriately
    if (mongoose.Types.ObjectId.isValid(exam)) {
      // It's a regular exam with a valid ID
      examHistoryData.exam = exam;
      examHistoryData.examType = 'regular';
    } else {
      // It's a practice quiz or other type without a valid ObjectId
      examHistoryData.examName = exam; // Store the name/identifier
      examHistoryData.examType = 'practice';
      // Don't set examHistoryData.exam since it's not a valid ObjectId
    }

    // Create the exam history record
    const newExamHistory = new ExamHistory(examHistoryData);
    const savedExamHistory = await newExamHistory.save();
    
    // Respond immediately
    res.status(201).json(savedExamHistory);
    
    // Generate performance summary in the background
    generatePerformanceSummary(savedExamHistory._id, enhancedQuestions, 
      topicPerformance, totalScore, totalQuestions)
      // .catch(err => console.error("Error generating performance summary:", err));
      
  } catch (error) {
    // console.error("Error creating exam history:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * Generate a detailed performance summary using Azure OpenAI
 * @param {string} examHistoryId - ID of the exam history record
 * @param {Array} questions - Enhanced questions with user answers
 * @param {Object} topicPerformance - Performance breakdown by topic
 * @param {number} totalScore - Overall score
 * @param {number} totalQuestions - Total number of questions
 */
async function generatePerformanceSummary(examHistoryId, questions, topicPerformance, totalScore, totalQuestions) {
  try {
    // Create input for analysis
    const analysisInput = {
      overallPerformance: {
        totalScore,
        totalQuestions,
        percentage: Math.round((totalScore / totalQuestions) * 100)
      },
      topicPerformance,
      questionSamples: questions.slice(0, 10).map(q => ({
        topic: q.topic,
        difficulty: q.difficulty,
        isCorrect: q.userAnswer === q.correctOption,
        conceptCategory: q.conceptCategory,
        priority: q.priority,
        timeSpent: q.timeSpentOnQuestion
      })),
      strengths: [],
      weaknesses: []
    };
    
    // Identify strengths and weaknesses
    Object.entries(topicPerformance).forEach(([topic, data]) => {
      if (data.score >= 80 && data.total >= 2) {
        analysisInput.strengths.push(`Strong performance in ${topic} (${data.score}%)`);
      } else if (data.score <= 50 && data.total >= 2) {
        analysisInput.weaknesses.push(`Needs improvement in ${topic} (${data.score}%)`);
      }
    });
    
    // Get system prompt
    const systemPrompt = getSystemPrompt("analytics") || 
      "You are an educational analytics expert that provides detailed, personalized feedback on exam performance.";
    
    // Query for performance summary
    const query = `Please analyze this exam performance data and provide a detailed, personalized summary:
      ${JSON.stringify(analysisInput, null, 2)}
      
      Include:
      1. Overall performance assessment
      2. Strengths and areas for improvement
      3. Topic-specific analysis
      4. Recommended study focus areas
      5. Personalized study tips
      
      Format your response as JSON with these fields:
      {
        "summary": "One paragraph overall summary",
        "detailedAnalysis": "Multiple paragraphs with detailed breakdown",
        "strengths": ["List of specific strengths"],
        "weaknesses": ["List of areas needing improvement"],
        "recommendations": ["List of specific study recommendations"]
      }`;
    
    // Call Azure OpenAI
    const result = await azureOpenai(query, systemPrompt, "gpt-4o");
    
    // Parse the JSON response
    let parsedResult;
    try {
      // Extract JSON if it's wrapped in markdown code blocks
      const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || 
                        result.match(/```\s*([\s\S]*?)\s*```/);
                        
      const jsonString = jsonMatch ? jsonMatch[1] : result;
      parsedResult = JSON.parse(jsonString);
    } catch (parseError) {
      // console.error("Error parsing performance summary:", parseError);
      // Create a fallback summary if parsing fails
      parsedResult = {
        summary: "Analysis was generated but couldn't be properly formatted.",
        detailedAnalysis: result.substring(0, 1000), // Use raw text
        strengths: analysisInput.strengths,
        weaknesses: analysisInput.weaknesses,
        recommendations: ["Review topics with lowest scores"]
      };
    }
    
    // Update the exam history with the generated summary
    await ExamHistory.findByIdAndUpdate(examHistoryId, {
      performanceSummary: parsedResult
    });
    
    // console.log(`Performance summary generated for exam history ${examHistoryId}`);
  } catch (error) {
    // console.error("Failed to generate performance summary:", error);
  }
}

// Update to the calculateDifficultyBreakdown function

function calculateDifficultyBreakdown(questions) {
  const breakdown = {
    Easy: { correct: 0, total: 0, percentage: 0 },
    Medium: { correct: 0, total: 0, percentage: 0 },
    Hard: { correct: 0, total: 0, percentage: 0 }
  };
  
  questions.forEach(q => {
    const difficulty = q.difficulty || 'Medium';
    if (!breakdown[difficulty]) {
      breakdown[difficulty] = { correct: 0, total: 0, percentage: 0 };
    }
    
    breakdown[difficulty].total++;
    // Use isCorrect directly instead of re-comparing
    if (q.isCorrect) {
      breakdown[difficulty].correct++;
    }
  });
  
  // Calculate percentages
  Object.keys(breakdown).forEach(key => {
    const data = breakdown[key];
    data.percentage = data.total > 0 ? 
      Math.round((data.correct / data.total) * 100) : 0;
  });
  
  return breakdown;
}

// Update to the calculateConceptBreakdown function
function calculateConceptBreakdown(questions) {
  const breakdown = {};
  
  questions.forEach(q => {
    const category = q.conceptCategory || 'general';
    if (!breakdown[category]) {
      breakdown[category] = { correct: 0, total: 0, percentage: 0 };
    }
    
    breakdown[category].total++;
    // Use isCorrect directly
    if (q.isCorrect) {
      breakdown[category].correct++;
    }
  });
  
  // Calculate percentages
  Object.keys(breakdown).forEach(key => {
    const data = breakdown[key];
    data.percentage = data.total > 0 ? 
      Math.round((data.correct / data.total) * 100) : 0;
  });
  
  return breakdown;
}

// Controller to get all exam history records
const getAllExamHistory = async (req, res) => {
  try {
    const examHistoryList = await ExamHistory.find();
    res.status(200).json(examHistoryList);
  } catch (error) {
    // console.error("Error getting exam history:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Controller to get a specific exam history record by username with pagination
const getExamHistoryByUsername = async (req, res) => {
  try {
    const { username, page = 1 } = req.query;
    const pageSize = 10;
    const examCount = await ExamHistory.countDocuments({ username: username });
    const maxPages = Math.ceil(examCount / pageSize);

    if (page > maxPages && maxPages > 0) {
      return res.status(404).json({
        errorMessage: "max-pages exceeded",
      });
    }

    const examHistory = await ExamHistory.find({ username: username })
      .sort({ timestamp: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize);

    if (!examHistory || examHistory.length === 0) {
      return res.status(404).json({ error: "Exam history not found" });
    }

    res.status(200).json({ 
      examHistory, 
      maxPages,
      analytics: {
        totalExams: examCount,
        recentPerformanceTrend: calculatePerformanceTrend(examHistory)
      }
    });
  } catch (error) {
    // console.error("Error getting exam history by username:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Calculate performance trend over recent exams
function calculatePerformanceTrend(examHistory) {
  if (!examHistory || examHistory.length < 2) {
    return { trend: "stable", change: 0 };
  }
  
  // Get scores from most recent 5 exams
  const recentScores = examHistory
    .slice(0, Math.min(5, examHistory.length))
    .map(exam => ({
      score: exam.totalScore / exam.totalQuestions * 100,
      date: new Date(exam.timestamp)
    }))
    .sort((a, b) => a.date - b.date); // Sort chronologically
    
  if (recentScores.length < 2) {
    return { trend: "stable", change: 0 };
  }
  
  // Calculate average change
  let totalChange = 0;
  for (let i = 1; i < recentScores.length; i++) {
    totalChange += recentScores[i].score - recentScores[i-1].score;
  }
  
  const averageChange = totalChange / (recentScores.length - 1);
  
  let trend;
  if (averageChange > 5) trend = "improving";
  else if (averageChange < -5) trend = "declining";
  else trend = "stable";
  
  return {
    trend,
    change: Math.round(averageChange * 10) / 10, // Round to 1 decimal place
    dataPoints: recentScores.map(s => Math.round(s.score))
  };
}

// Controller to delete a specific exam history record by ID
const deleteExamHistoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedExamHistory = await ExamHistory.findByIdAndDelete(id);

    if (!deletedExamHistory) {
      return res.status(404).json({ error: "Exam history not found" });
    }

    res.status(200).json(deletedExamHistory);
  } catch (error) {
    // console.error("Error deleting exam history by ID:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Get analytics aggregated by topic across all exams for a user
const getUserAnalytics = async (req, res) => {
  try {
    const { username } = req.params;
    
    // Get all exam history for the user
    const examHistory = await ExamHistory.find({ username })
      .sort({ timestamp: -1 })
      .limit(20); // Limit to recent exams for performance
      
    if (!examHistory || examHistory.length === 0) {
      return res.status(404).json({ error: "No exam history found for this user" });
    }
    
    // Aggregate topic performance across all exams
    const topicPerformance = {};
    const difficultyPerformance = {
      Easy: { correct: 0, total: 0, percentage: 0 },
      Medium: { correct: 0, total: 0, percentage: 0 },
      Hard: { correct: 0, total: 0, percentage: 0 }
    };
    
    // Track progress over time
    const progressTimeline = examHistory.map(exam => ({
      date: exam.timestamp,
      score: exam.totalScore / exam.totalQuestions * 100,
      examName: exam.examType === 'regular' ? exam.exam?.name : exam.examName || "Unnamed Exam"
    }));
    
    // Collect all questions for detailed analysis
    let allQuestions = [];
    
    examHistory.forEach(exam => {
      // Check if exam has questions array
      if (!exam.questions || !Array.isArray(exam.questions)) {
        // console.warn(`Exam ${exam._id} has no valid questions array`);
        return; // Skip this exam
      }
      
      // Process questions
      exam.questions.forEach(q => {
        // Calculate isCorrect properly for analytics
        let isCorrect = false;
        
        if (q.userAnswer && q.options && q.correctOption) {
          // If userAnswer is a number or index string, compare directly with correctOption
          if (!isNaN(q.userAnswer) || (typeof q.userAnswer === 'string' && /^\d+$/.test(q.userAnswer))) {
            isCorrect = q.userAnswer.toString() === q.correctOption.toString();
          } 
          // If userAnswer is text, find its index and compare with correctOption
          else {
            const answerIndex = q.options.findIndex(
              option => option === q.userAnswer
            );
            isCorrect = answerIndex !== -1 && answerIndex.toString() === q.correctOption.toString();
          }
        }
        
        // Add to all questions for analysis
        allQuestions.push({
          topic: q.topic || "General",
          difficulty: q.difficulty || "Medium",
          isCorrect: isCorrect,
          conceptCategory: q.conceptCategory || "general",
          timestamp: exam.timestamp
        });
        
        // Update topic statistics
        const topic = q.topic || "General";
        if (!topicPerformance[topic]) {
          topicPerformance[topic] = { correct: 0, total: 0, percentage: 0 };
        }
        
        topicPerformance[topic].total++;
        if (isCorrect) {
          topicPerformance[topic].correct++;
        }
        
        // Update difficulty statistics
        const difficulty = q.difficulty || "Medium";
        // Check if this difficulty exists in our object, if not create it
        if (!difficultyPerformance[difficulty]) {
          difficultyPerformance[difficulty] = { correct: 0, total: 0, percentage: 0 };
        }
        
        difficultyPerformance[difficulty].total++;
        if (isCorrect) {
          difficultyPerformance[difficulty].correct++;
        }
      });
    });
    
    // Calculate percentages
    Object.keys(topicPerformance).forEach(topic => {
      const data = topicPerformance[topic];
      data.percentage = data.total > 0 ? 
        Math.round((data.correct / data.total) * 100) : 0;
    });
    
    Object.keys(difficultyPerformance).forEach(difficulty => {
      const data = difficultyPerformance[difficulty];
      data.percentage = data.total > 0 ? 
        Math.round((data.correct / data.total) * 100) : 0;
    });
    
    // Find strengths and weaknesses
    const strengths = Object.entries(topicPerformance)
      .filter(([_, data]) => data.percentage >= 80 && data.total >= 3)
      .map(([topic, data]) => ({
        topic,
        percentage: data.percentage,
        questionCount: data.total
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3);
      
    const weaknesses = Object.entries(topicPerformance)
      .filter(([_, data]) => data.total >= 3)
      .map(([topic, data]) => ({
        topic,
        percentage: data.percentage,
        questionCount: data.total
      }))
      .sort((a, b) => a.percentage - b.percentage)
      .slice(0, 3);

    
    // Send aggregated analytics
    res.status(200).json({
      success: true,
      data: {
        username,
        examCount: examHistory.length,
        totalQuestionsAnswered: allQuestions.length,
        overallPerformance: {
          correct: allQuestions.filter(q => q.isCorrect).length,
          total: allQuestions.length,
          percentage: allQuestions.length > 0 ? 
            Math.round((allQuestions.filter(q => q.isCorrect).length / allQuestions.length) * 100) : 0
        },
        topicPerformance,
        difficultyPerformance,
        progressTimeline,
        strengths,
        weaknesses,
        recentPerformanceTrend: calculatePerformanceTrend(examHistory)
      }
    });
    
  } catch (error) {
    // console.error("Error getting user analytics:", error);
    res.status(500).json({ 
      success: false,
      error: "Internal Server Error" 
    });
  }
};

// Get highlighted questions for a user's reading list
const getHighlightedQuestions = async (req, res) => {
  try {
    const { username } = req.params;
    
    // Find recent exam histories with highlighted questions
    const examHistories = await ExamHistory.find({ 
      username,
      highlightedQuestions: { $exists: true, $ne: [] }
    })
    .sort({ timestamp: -1 })
    .limit(10);
    
    if (!examHistories || examHistories.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "No highlighted questions found" 
      });
    }
    
    // Collect all highlighted questions
    const highlightedQuestions = [];
    examHistories.forEach(history => {
      if (history.highlightedQuestions && history.highlightedQuestions.length > 0) {
        history.highlightedQuestions.forEach(q => {
          highlightedQuestions.push({
            ...q,
            examDate: history.timestamp,
            examName: history.exam?.name || "Unnamed Exam"
          });
        });
      }
    });
    
    res.status(200).json({
      success: true,
      data: highlightedQuestions,
      count: highlightedQuestions.length
    });
    
  } catch (error) {
    // console.error("Error getting highlighted questions:", error);
    res.status(500).json({ 
      success: false,
      error: "Internal Server Error" 
    });
  }
};

// Controller to get a specific exam history record by ID
const getExamHistoryById = async (req, res) => {
  try {
    const { id } = req.params;
    // console.log("Exam history ID:", id);
    
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid exam history ID format"
      });
    }
    
    // Find the specific exam history and populate exam data if it's a regular exam
    const examHistory = await ExamHistory.findById(id);
    
    if (!examHistory) {
      return res.status(404).json({
        success: false,
        message: "Exam history not found"
      });
    }
    
    // Format the response with all necessary data for the frontend
    const response = {
      _id: examHistory._id,
      username: examHistory.username,
      totalScore: examHistory.totalScore,
      totalQuestions: examHistory.totalQuestions,
      timeSpent: examHistory.timeSpent,
      timestamp: examHistory.timestamp,
      
      // Display either the exam name from the Exam model or the stored name
      examName: examHistory.examType === 'regular'
        ? examHistory.exam?.name
        : examHistory.examName,
        
      examType: examHistory.examType,
      topicPerformance: examHistory.topicPerformance || {},
      difficultyBreakdown: examHistory.difficultyBreakdown || {},
      conceptCategoryBreakdown: examHistory.conceptCategoryBreakdown || {},
      
      // Include performance summary if available
      performanceSummary: examHistory.performanceSummary || null,
      
      // Include questions data
      questions: examHistory.questions.map(q => {
        // Calculate isCorrect properly
        let isCorrect = false;
        
        if (q.userAnswer && q.options && q.correctOption) {
          // If userAnswer is a number or index string, compare directly with correctOption
          if (!isNaN(q.userAnswer) || (typeof q.userAnswer === 'string' && /^\d+$/.test(q.userAnswer))) {
            isCorrect = q.userAnswer.toString() === q.correctOption.toString();
          } 
          // If userAnswer is text, find its index and compare with correctOption
          else {
            const answerIndex = q.options.findIndex(
              option => option === q.userAnswer
            );
            isCorrect = answerIndex !== -1 && answerIndex.toString() === q.correctOption.toString();
          }
        }
        
        return {
          _id: q._id,
          question: q.question,
          options: q.options,
          correctOption: q.correctOption,
          userAnswer: q.userAnswer,
          isCorrect: isCorrect,
          topic: q.topic || "General",
          difficulty: q.difficulty || "Medium",
          conceptCategory: q.conceptCategory || "general",
          timeSpentOnQuestion: q.timeSpentOnQuestion || 0,
          isHighlighted: q.isHighlighted || false,
          explanation: q.explanation || "No explanation is available for this question",
          reference: q.reference || "No reference provided"
        };
      }),
      
      // Include highlighted questions if available
      highlightedQuestions: examHistory.highlightedQuestions || []
    };

    // console.log(response);
    
    return res.status(200).json({
      success: true,
      data: response
    });
    
  } catch (error) {
    // console.error("Error getting exam history by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve exam history",
      error: error.message
    });
  }
};

module.exports = {
  getAllExamHistory,
  createExamHistory,
  getExamHistoryByUsername,
  deleteExamHistoryById,
  getUserAnalytics,
  getHighlightedQuestions,
  getExamHistoryById
};
