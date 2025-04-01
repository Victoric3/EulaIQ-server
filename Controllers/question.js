const fetch = require("node-fetch");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const Exam = require("../Models/exam");
const Story = require("../Models/story");
const { processTextChunks } = require("../Helpers/Libraries/azureOpenai");
const mongoose = require("mongoose");

exports.getQuestion = async (req, res) => {
  // Extract the request data and API key from the request body
  const requestData = req.body;
  const apiKey = process.env.MIDDLEMAN_API_KEY;
  try {
    // Make a request to the external server using the Fetch API
    const response = await fetch(
      `${process.env.ALPHALEARN3_BASEURL}/api/v1/questions/McqQuestion/${apiKey}/${process.env.API_USERNAME}`,
      {
        method: "POST",
        body: JSON.stringify(requestData),
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return res.status(400).json({
        statusCode: response.statusCode,
        errorMessage: data.errorMessage,
      });
    }

    // Forward the response from the external server to the client
    res.status(200).json(data);
  } catch (error) {
    // Handle errors and forward them to the client
    res.status(500).json({
      errorMessage: `An error occurred while processing the request: ${error}`,
    });
  }
};

exports.handleQuestionGeneration = async (req, res) => {
  try {
    const {
      questionType = "mcq",
      questionDescription,
      examClass = "Medical",
      institution = "EulaIQ",
      course,
      topic,
      category = "Medical",
      grade = "Professional",
      difficulty = "Medium",
      duration = 60,
      name,
      ebookId
    } = req.body;
    
    // Find ebook and validate
    const ebook = await Story.findById(ebookId)
      .select('title description image sections status slug questions')
      .lean();
    
    if (!ebook) {
      return res.status(404).json({
        success: false,
        message: "Ebook not found"
      });
    }
    
    // Create exam with initial state
    const examName = name || `Questions for ${ebook.title}`;
    const exam = new Exam({
      name: examName,
      category: category,
      grade: grade,
      difficulty: difficulty,
      author: req.user._id,
      description: ebook.description || "Generated from ebook",
      duration: duration,
      questions: [],
      textChunks: [], 
      associatedEbook: ebookId,
      status: 'processing',
      progress: 0,
      retryCount: 0,
      processingStatus: ebook.status === 'complete' ? 
        'Organizing content sections' : 
        'Waiting for ebook processing to complete'
    });
    
    await exam.save();
    
    // Add exam reference to the ebook (two-way relationship)
    await Story.findByIdAndUpdate(ebookId, {
      $push: { questions: exam._id }
    });
    
    res.status(202).json({
      success: true,
      message: "Question generation started",
      examId: exam._id,
      status: "processing",
      waitingForEbook: ebook.status !== 'complete'
    });
    
    // Start background processing
    generateQuestionsInBackground(ebook, exam, {
      questionType,
      questionDescription,
      examClass,
      institution,
      course: course || ebook.title,
      topic: topic || "General Knowledge"
    }).catch(async (error) => {
      console.error("Question generation failed:", error);
      await Exam.findByIdAndUpdate(exam._id, {
        status: 'error',
        error: error.message
      });
    });
    
  } catch (error) {
    console.error("Error initiating question generation:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to start question generation",
      error: error.message
    });
  }
};

/**
 * Generate questions in background with progress tracking and retry mechanism
 */
async function generateQuestionsInBackground(ebook, exam, options) {
  console.log(`Starting question generation for ebook: ${ebook._id}`);
  
  try {
    await exam.updateOne({ 
      $set: { 
        status: 'processing',
        startTime: new Date()
      }
    });
    
    // Check if ebook processing is complete, if not wait and retry
    // This enables parallel processing with intelligent waiting
    const MAX_RETRIES = 3;
    let retryCount = 0;
    
    // Get the latest ebook status (not using the ebook parameter, which could be stale)
    let currentEbook = await Story.findById(ebook._id)
      .select('sections status title')
      .lean();
    
    // If ebook is not complete, implement retry logic
    while (currentEbook.status !== 'complete' && retryCount < MAX_RETRIES) {
      // Update exam status to indicate waiting
      await exam.updateOne({
        $set: {
          processingStatus: `Waiting for ebook processing to complete (attempt ${retryCount + 1}/${MAX_RETRIES})`,
          retryCount: retryCount + 1
        }
      });
      
      console.log(`Ebook ${ebook._id} not ready yet. Waiting before retry ${retryCount + 1}/${MAX_RETRIES}`);
      
      // Exponential backoff: wait longer between each retry
      const waitTime = 5000 * Math.pow(2, retryCount); // 5s, 10s, 20s
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Check ebook status again
      currentEbook = await Story.findById(ebook._id)
        .select('sections status title')
        .lean();
      
      retryCount++;
    }
    
    // If we've exhausted retries and ebook still not ready, fail with appropriate message
    if (currentEbook.status !== 'complete' && retryCount >= MAX_RETRIES) {
      throw new Error(`Ebook processing not complete after ${MAX_RETRIES} retry attempts. Try again later.`);
    }
    
    // If we're here, ebook is ready or we got enough content to proceed
    
    // Update exam with latest ebook info
    await exam.updateOne({
      $set: {
        processingStatus: 'Organizing content sections',
      }
    });
    
    // Group sections by head/sub structure
    const headSections = currentEbook.sections?.filter(s => s.type === 'head') || [];
    const totalSections = headSections.length;
    
    if (totalSections === 0) {
      throw new Error("No content sections found in ebook");
    }
    
    // Process head sections one by one
    let allQuestions = [];
    let previousContent = null;
    
    for (let i = 0; i < headSections.length; i++) {
      const headSection = headSections[i];
      const progress = Math.round(((i + 1) / totalSections) * 100);
      
      // Update progress
      await exam.updateOne({
        $set: {
          progress: progress,
          processingStatus: `Processing section ${i+1}/${totalSections}: ${headSection.title}`
        }
      });
      
      // Get sub-sections for this head section
      const subSections = currentEbook.sections.filter(s => 
        s.type === 'sub' && 
        currentEbook.sections.indexOf(s) > currentEbook.sections.indexOf(headSection) &&
        (i === headSections.length - 1 || currentEbook.sections.indexOf(s) < currentEbook.sections.indexOf(headSections[i+1]))
      );
      
      // Combine head and subsections for processing
      const sectionGroup = [headSection, ...subSections];
      
      // Process this section group
      const systemInstruction = `
      You are an expert medical education content creator working for EulaIQ.
      Your task is to create high-quality multiple-choice questions based on the medical content provided.
      
      Guidelines:
      - Create medically accurate questions based ONLY on the provided content
      - Each question should have 4 options (A-D) with exactly one correct answer
      - Provide a detailed explanation for why the correct answer is right
      - Generate varied difficulty levels (easy, medium, hard)
      - Analyze the importance of each question with these additional fields:
        * priority: 'high', 'medium', or 'low' based on clinical importance
        * relevanceScore: numerical value 0-100 indicating importance (higher = more important)
        * examFrequency: 'very common', 'common', 'uncommon', or 'rare' based on how often this appears in exams
        * conceptCategory: categorize the concept
      - For each question, specify which part of the content it's from to aid navigation
      `;
      
      // Generate questions for this section
      const result = await processTextChunks(
        previousContent,
        sectionGroup,
        options.questionType,
        options.questionDescription,
        null,
        i === headSections.length - 1, // isLast
        "question",
        systemInstruction
      );
      
      // Process and save questions
      if (result && result.questions && result.questions.length > 0) {
        const sectionQuestions = result.questions.map(q => ({
          ...q,
          examClass: options.examClass,
          Institution: options.institution,
          course: options.course,
          topic: headSection.title,
          navigationReference: {
            sectionTitle: headSection.title
          }
        }));
        
        // Add to exam
        await exam.updateOne({
          $push: { questions: { $each: sectionQuestions } }
        });
        
        allQuestions = allQuestions.concat(sectionQuestions);
        console.log(`Added ${sectionQuestions.length} questions for section: ${headSection.title}`);
      } else {
        console.warn(`No questions generated for section: ${headSection.title}`);
      }
      
      // Use current content as context for next round
      previousContent = headSection.content;
    }
    
    // Mark as complete
    await exam.updateOne({
      $set: {
        status: 'complete',
        progress: 100,
        processingStatus: `Generated ${allQuestions.length} questions from ${totalSections} sections`,
        endTime: new Date()
      }
    });
    
    console.log(`Question generation complete for exam ${exam._id}: ${allQuestions.length} questions`);
    
  } catch (error) {
    console.error(`Question generation failed for ebook ${ebook._id}:`, error);
    
    // Update exam with error status
    await Exam.findByIdAndUpdate(exam._id, {
      $set: {
        status: 'error',
        processingStatus: `Error: ${error.message}`,
        error: error.message
      }
    });
    
    throw error;
  }
}

/**
 * Get question generation status
 */
exports.getQuestionGenerationStatus = async (req, res) => {
  try {
    const { examId } = req.params;
    
    // Select additional fields to include priority info
    const exam = await Exam.findById(examId)
      .select('name status progress processingStatus questions.priority questions.relevanceScore startTime endTime error')
      .lean();
    
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found"
      });
    }
    
    // Calculate priority breakdown if questions exist
    let priorityBreakdown = { high: 0, medium: 0, low: 0 };
    let averageRelevance = 0;
    
    if (exam.questions && exam.questions.length > 0) {
      exam.questions.forEach(q => {
        if (q.priority) priorityBreakdown[q.priority]++;
        if (q.relevanceScore) averageRelevance += q.relevanceScore;
      });
      averageRelevance = Math.round(averageRelevance / exam.questions.length);
    }
    
    return res.status(200).json({
      success: true,
      data: {
        id: exam._id,
        name: exam.name,
        status: exam.status,
        progress: exam.progress,
        processingStatus: exam.processingStatus,
        questionCount: exam.questions?.length || 0,
        priorityBreakdown,
        averageRelevance,
        startTime: exam.startTime,
        endTime: exam.endTime,
        error: exam.error
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch question generation status",
      error: error.message
    });
  }
};



exports.continueQuestionGeneration = async (req, res) => {
  try {
    const { examId, questionType, questionDescription } = req.body;
    console.log(examId, questionType, questionDescription);
    // Validate required parameter
    if (!examId || !questionType || !questionDescription) {
      return res.status(400).json({
        success: false,
        message: "examId, questionType, and questionDescription is required"
      });
    }
    
    // Find the exam by ID
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ 
        success: false,
        message: "Exam not found" 
      });
    }
    
    // Make sure the exam is not already complete
    if (exam.status === 'complete') {
      return res.status(400).json({
        success: false,
        message: "Exam generation is already complete"
      });
    }
    
    // Reset error status if needed
    if (exam.status === 'error') {
      await exam.updateOne({
        $set: {
          status: 'processing',
          processingStatus: 'Resuming question generation',
          error: null
        }
      });
    }
    
    // Get associated ebook
    const ebook = await Story.findById(exam.associatedEbook)
      .select('title description sections status')
      .lean();
      
    if (!ebook) {
      return res.status(404).json({
        success: false,
        message: "Associated ebook not found"
      });
    }
    
    // Respond immediately
    res.status(202).json({
      success: true,
      message: "Question generation resumed",
      examId: exam._id,
      status: "processing"
    });
    
    // Prepare options from existing exam and any provided overrides
    const options = {
      // Use provided values or fall back to existing exam values
      questionType: questionType || exam.questionType || "mcq",
      questionDescription: questionDescription || exam.questionDescription,
      
      // Always derive these from the exam
      examClass: exam.examClass || "Medical",
      institution: exam.Institution || "EulaIQ",
      course: exam.course || ebook.title,
      topic: exam.topic || "General Knowledge"
    };
    
    // Resume background processing but continue from where it left off
    continueQuestionsInBackground(ebook, exam, options).catch(async (error) => {
      console.error("Question generation failed:", error);
      await Exam.findByIdAndUpdate(exam._id, {
        status: 'error',
        error: error.message
      });
    });
    
  } catch (error) {
    console.error("Error continuing question generation:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to continue question generation",
      error: error.message
    });
  }
};

/**
 * Continue question generation from where it left off
 */
async function continueQuestionsInBackground(ebook, exam, options) {
  console.log(`Continuing question generation for exam: ${exam._id}`);
  
  try {
    await exam.updateOne({ 
      $set: { 
        status: 'processing',
        processingStatus: 'Resuming question generation'
      }
    });
    
    // Get the latest ebook status
    let currentEbook = await Story.findById(ebook._id)
      .select('sections status title')
      .lean();
    
    // If ebook still not complete, check if we can proceed anyway
    if (currentEbook.status !== 'complete') {
      console.log(`Warning: Ebook ${ebook._id} still not complete, but attempting to continue anyway`);
      
      // Update status message but continue
      await exam.updateOne({
        $set: {
          processingStatus: 'Continuing with incomplete ebook (some content may be missing)'
        }
      });
    }
    
    // Group sections by head/sub structure
    const headSections = currentEbook.sections?.filter(s => s.type === 'head') || [];
    const totalSections = headSections.length;
    
    if (totalSections === 0) {
      throw new Error("No content sections found in ebook");
    }
    
    // Determine which sections have already been processed
    // by checking which section titles already have questions
    const existingQuestionSectionTitles = exam.questions
      .map(q => q.navigationReference?.sectionTitle)
      .filter(Boolean);
    
    // Find the index of the last processed section
    let startIndex = 0;
    for (let i = 0; i < headSections.length; i++) {
      if (existingQuestionSectionTitles.includes(headSections[i].title)) {
        startIndex = i + 1; // Start from the next section
      }
    }
    
    // If all sections have been processed, just mark as complete
    if (startIndex >= headSections.length) {
      console.log(`All sections already processed for exam ${exam._id}`);
      await exam.updateOne({
        $set: {
          status: 'complete',
          progress: 100,
          processingStatus: `All sections already processed (${exam.questions.length} questions)`,
          endTime: new Date()
        }
      });
      return;
    }
    
    console.log(`Continuing question generation from section index ${startIndex} of ${headSections.length}`);
    
    // Process remaining head sections
    let allQuestions = [...exam.questions]; // Start with existing questions
    let previousContent = null;
    
    // If there's a previous section, use its content for context
    if (startIndex > 0) {
      previousContent = headSections[startIndex - 1].content;
    }
    
    for (let i = startIndex; i < headSections.length; i++) {
      const headSection = headSections[i];
      const progress = Math.round(((i + 1) / totalSections) * 100);
      
      // Update progress
      await exam.updateOne({
        $set: {
          progress: progress,
          processingStatus: `Processing section ${i+1}/${totalSections}: ${headSection.title}`
        }
      });
      
      // Get sub-sections for this head section
      const subSections = currentEbook.sections.filter(s => 
        s.type === 'sub' && 
        currentEbook.sections.indexOf(s) > currentEbook.sections.indexOf(headSection) &&
        (i === headSections.length - 1 || currentEbook.sections.indexOf(s) < currentEbook.sections.indexOf(headSections[i+1]))
      );
      
      // Combine head and subsections for processing
      const sectionGroup = [headSection, ...subSections];
      
      // Process this section group - using the same systemInstruction as the original function
      const systemInstruction = `
      You are an expert medical education content creator working for EulaIQ.
      Your task is to create high-quality multiple-choice questions based on the medical content provided.
      
      Guidelines:
      - Create medically accurate questions based ONLY on the provided content
      - Each question should have 4 options (A-D) with exactly one correct answer
      - Provide a detailed explanation for why the correct answer is right
      - Generate varied difficulty levels (easy, medium, hard)
      - Analyze the importance of each question with these additional fields:
        * priority: 'high', 'medium', or 'low' based on clinical importance
        * relevanceScore: numerical value 0-100 indicating importance (higher = more important)
        * examFrequency: 'very common', 'common', 'uncommon', or 'rare' based on how often this appears in exams
        * conceptCategory: categorize the concept
      - For each question, specify which part of the content it's from to aid navigation
      `;
      
      // Generate questions for this section
      const result = await processTextChunks(
        previousContent,
        sectionGroup,
        options.questionType,
        options.questionDescription,
        null,
        i === headSections.length - 1, // isLast
        "question",
        systemInstruction
      );
      
      // Process and save questions
      if (result && result.questions && result.questions.length > 0) {
        const sectionQuestions = result.questions.map(q => ({
          ...q,
          examClass: options.examClass,
          Institution: options.institution,
          course: options.course,
          topic: headSection.title,
          navigationReference: {
            sectionTitle: headSection.title,
            sectionIndex: i,  // Store section index for navigation
            sectionPosition: currentEbook.sections.indexOf(headSection)  // Store absolute position in all sections
          }
        }));
        
        // Add to exam
        await exam.updateOne({
          $push: { questions: { $each: sectionQuestions } }
        });
        
        allQuestions = allQuestions.concat(sectionQuestions);
        console.log(`Added ${sectionQuestions.length} questions for section: ${headSection.title}`);
      } else {
        console.warn(`No questions generated for section: ${headSection.title}`);
      }
      
      // Use current content as context for next round
      previousContent = headSection.content;
    }
    
    // Mark as complete
    await exam.updateOne({
      $set: {
        status: 'complete',
        progress: 100,
        processingStatus: `Generated ${allQuestions.length} questions from ${totalSections} sections`,
        endTime: new Date()
      }
    });
    
    console.log(`Question generation complete for exam ${exam._id}: ${allQuestions.length} questions`);
    
  } catch (error) {
    console.error(`Question generation failed for exam ${exam._id}:`, error);
    
    // Update exam with error status
    await Exam.findByIdAndUpdate(exam._id, {
      $set: {
        status: 'error',
        processingStatus: `Error: ${error.message}`,
        error: error.message
      }
    });
    
    throw error;
  }
}

exports.fetchExamData = async (req, res) => {
  try {
    const { 
      name, 
      QandA = false,
      groupBy = 'default', // 'default', 'priority', 'conceptCategory'
      colorTheme = 'warm', // 'warm', 'cool', 'professional', 'medical', 'custom'
      customColors = null, // Array of hex colors if theme is 'custom'
      includeMetadata = true // Include priority and relevance info
    } = req.body;

    // Fetch exam data by the exam name
    const examData = await Exam.findOne({ name })
      .populate('associatedEbook', 'title')
      .lean();

    if (!examData) {
      return res.status(404).json({ 
        success: false,
        message: `No exam found with the name "${name}"` 
      });
    }

    // Define color themes
    const colorThemes = {
      warm: {
        primary: '#D13525', // Deep Red
        secondary: '#F2C175', // Warm Yellow
        tertiary: '#F29F05', // Orange
        text: '#261E1E', // Dark Brown
        background: '#FFF9F1' // Light Cream
      },
      cool: {
        primary: '#055C9D', // Deep Blue
        secondary: '#9BC1BC', // Teal
        tertiary: '#5C80BC', // Medium Blue
        text: '#1D3557', // Dark Blue
        background: '#F6FEFF' // Light Blue White
      },
      professional: {
        primary: '#2E5077', // Navy Blue
        secondary: '#5E8B7E', // Sage Green
        tertiary: '#A7ACD9', // Lavender
        text: '#2B303A', // Dark Gray
        background: '#F7F9FC' // Light Gray
      },
      medical: {
        primary: '#1F7A8C', // Teal
        secondary: '#7CA982', // Sage Green
        tertiary: '#BFDBF7', // Light Blue
        text: '#022B3A', // Dark Blue
        background: '#F9FCFF' // Ultra Light Blue
      }
    };

    // Determine colors to use
    let colors;
    if (colorTheme === 'custom' && Array.isArray(customColors) && customColors.length >= 5) {
      colors = {
        primary: customColors[0],
        secondary: customColors[1],
        tertiary: customColors[2],
        text: customColors[3],
        background: customColors[4]
      };
    } else {
      colors = colorThemes[colorTheme] || colorThemes.warm;
    }

    // Group questions if specified
    let groupedQuestions = {};
    let orderedQuestions = [...examData.questions];
    
    if (groupBy === 'priority') {
      groupedQuestions = {
        high: orderedQuestions.filter(q => q.priority === 'high'),
        medium: orderedQuestions.filter(q => q.priority === 'medium'),
        low: orderedQuestions.filter(q => q.priority === 'low')
      };
    } else if (groupBy === 'conceptCategory') {
      groupedQuestions = orderedQuestions.reduce((acc, q) => {
        const category = q.conceptCategory || 'uncategorized';
        if (!acc[category]) acc[category] = [];
        acc[category].push(q);
        return acc;
      }, {});
    } else {
      groupedQuestions = orderedQuestions.reduce((acc, q) => {
        const section = q.sectionTitle || 'General';
        if (!acc[section]) acc[section] = [];
        acc[section].push(q);
        return acc;
      }, {});
    }

    // --- Create an enhanced PDF document ---
    const doc = new PDFDocument({
      margins: { top: 50, bottom: 50, left: 60, right: 60 },
      info: {
        Title: `${examData.name} - EulaIQ Generated Exam`,
        Author: 'EulaIQ',
        Subject: examData.description,
        Keywords: 'education, exam, medical, eulaiq'
      }
    });
    
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const pdfPath = path.join(__dirname, `${name}-${QandA ? 'QandA' : 'exam'}-${timestamp}.pdf`);
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);
    
    // Define watermark function
    const addWatermark = () => {
      const watermarkText = 'Generated by EulaIQ';
      const fontSize = 48;
      doc.save();
      doc.fillOpacity(0.1).fillColor(colors.text);
      doc.fontSize(fontSize);
      const textWidth = doc.widthOfString(watermarkText);
      const textHeight = doc.heightOfString(watermarkText);
      const x = (doc.page.width - textWidth) / 2;
      const y = (doc.page.height - textHeight) / 2;
      doc.text(watermarkText, x, y);
      doc.restore();
    };

    // Add background color and watermark to initial page
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(colors.background);
    addWatermark();
       
    // Add header
    doc.rect(0, 0, doc.page.width, 100).fill(colors.primary);
    
    doc.fillColor('white')
       .fontSize(24)
       .font('Helvetica-Bold')
       .text(`${examData.name}`, 60, 40);
       
    doc.fillColor(colors.secondary)
       .fontSize(12)
       .font('Helvetica')
       .text(`${examData.category} | ${examData.grade} | Difficulty: ${examData.difficulty} | Duration: ${examData.duration}min`, 60, 70);
    
    doc.moveDown(4);

    // Add description
    doc.fillColor(colors.text)
       .fontSize(14)
       .font('Helvetica-Oblique')
       .text(examData.description, { width: doc.page.width - 120 })
       .moveDown(2);
       
    // Add generated timestamp
    const formattedDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    doc.fillColor(colors.tertiary)
       .fontSize(10)
       .text(`Generated: ${formattedDate} | Total Questions: ${examData.questions.length}`, { align: 'right' })
       .moveDown(2);

    // Process each group of questions
    let questionNumber = 1;
    
    Object.entries(groupedQuestions).forEach(([groupName, questions]) => {
      if (questions.length === 0) return;
      
      doc.fillColor(colors.primary)
         .fontSize(16)
         .font('Helvetica-Bold')
         .text(groupBy === 'priority' ? 
            `${groupName.toUpperCase()} PRIORITY QUESTIONS (${questions.length})` : 
            `${groupName} (${questions.length} questions)`)
         .moveDown(1);
      
      questions.forEach((question, index) => {
        const qNum = questionNumber++;
        
        if (doc.y > doc.page.height - 150) {
          doc.addPage();
          doc.rect(0, 0, doc.page.width, doc.page.height).fill(colors.background);
          addWatermark();
          doc.rect(0, 0, doc.page.width, 40).fill(colors.primary);
          doc.fillColor('white')
             .fontSize(14)
             .text(`${examData.name} (continued)`, 60, 15);
          doc.moveDown(2);
        }
        
        // Set starting x and y for question header
        doc.x = 60;
        const currentY = doc.y;
        
        // Write "Question X:" with continued: true
        doc.fillColor(colors.text)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text(`Question ${qNum}: `, { continued: true });
        
        if (includeMetadata) {
          const badgeColor = {
            high: '#E63946',
            medium: '#457B9D',
            low: '#6B705C'
          }[question.priority] || colors.tertiary;
          const metadata = `[${question.priority} priority • ${question.relevanceScore || 50}/100 • ${question.examFrequency || 'common'}]`;
          doc.fillColor(badgeColor)
             .fontSize(10)
             .font('Helvetica');
          const metadataWidth = doc.widthOfString(metadata);
          doc.x = doc.page.width - 60 - metadataWidth;
          doc.text(metadata);
        }
        
        // Move down for question text
        doc.moveDown(1);
        
        doc.fillColor(colors.text)
           .fontSize(12)
           .font('Helvetica')
           .text(question.question)
           .moveDown(1);
        
        const optionLetters = ['A', 'B', 'C', 'D'];
        question.options.forEach((option, i) => {
          const isCorrect = parseInt(question.correctOption, 10) === i;
          
          if (QandA && isCorrect) {
            doc.fillColor(colors.primary);
            doc.rect(doc.x - 15, doc.y - 5, 10, 10).fill();
            doc.fillColor('white')
               .text(optionLetters[i], doc.x - 15, doc.y - 5, {
                  width: 10,
                  align: 'center'
               });
            
            doc.fillColor(colors.text)
               .font('Helvetica-Bold')
               .text(`${option} ✓`, { paragraphGap: 5 })
               .font('Helvetica');
          } else {
            doc.fillColor(colors.text)
               .text(`${optionLetters[i]}. ${option}`, { paragraphGap: 5 });
          }
        });
        
        if (QandA) {
          doc.moveDown(1);
          doc.fillColor(colors.secondary)
             .fontSize(11)
             .font('Helvetica-Oblique')
             .text('Explanation:', { paragraphGap: 5 });
             
          doc.fillColor(colors.text)
             .fontSize(11)
             .font('Helvetica')
             .text(question.explanation, { paragraphGap: 5 });
             
          if (question.reference && question.reference !== "No reference was provided for this material") {
            doc.fillColor(colors.tertiary)
               .fontSize(10)
               .font('Helvetica-Oblique')
               .text(`Reference: ${question.reference}`);
          }
          
          if (question.conceptCategory && question.conceptCategory !== 'general') {
            doc.fillColor(colors.tertiary)
               .fontSize(10)
               .text(`Category: ${question.conceptCategory}`);
          }
        }
        
        doc.strokeColor(colors.tertiary)
           .lineWidth(0.5)
           .moveTo(60, doc.y + 10)
           .lineTo(doc.page.width - 60, doc.y + 10)
           .stroke();
           
        doc.moveDown(2);
      });
    });
    
    if (!QandA) {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(colors.background);
      addWatermark();
         
      doc.rect(0, 0, doc.page.width, 100).fill(colors.primary);
      doc.fillColor('white')
         .fontSize(24)
         .font('Helvetica-Bold')
         .text('ANSWER KEY', 60, 40);
         
      doc.fillColor(colors.secondary)
         .fontSize(12)
         .font('Helvetica')
         .text(`${examData.name}`, 60, 70);
         
      doc.moveDown(4);
      
      questionNumber = 1;
      examData.questions.forEach(question => {
        const correctOptionIndex = parseInt(question.correctOption, 10);
        const correctOptionLetter = String.fromCharCode(65 + correctOptionIndex);
        
        doc.fillColor(colors.text)
           .fontSize(12)
           .font('Helvetica-Bold')
           .text(`${questionNumber++}. ${correctOptionLetter}`);
           
        doc.fillColor(colors.tertiary)
           .fontSize(10)
           .font('Helvetica')
           .text(question.question.substring(0, 50) + '...')
           .moveDown(0.5);
           
        doc.fillColor(colors.text)
           .fontSize(11)
           .text(question.explanation)
           .moveDown(1);
      });
    }
    
    // Add footer with page numbers to each page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      
      doc.strokeColor(colors.tertiary)
         .lineWidth(0.5)
         .moveTo(60, doc.page.height - 50)
         .lineTo(doc.page.width - 60, doc.page.height - 50)
         .stroke();
         
      doc.fillColor(colors.text)
         .fontSize(10)
         .text(
           `Page ${i + 1} of ${range.count}`,
           0,
           doc.page.height - 30,
           { align: 'center' }
         );
         
      doc.fillColor(colors.primary)
         .fontSize(10)
         .text(
           'Generated by EulaIQ',
           doc.page.width - 150,
           doc.page.height - 30
         );
    }
    
    doc.end();

    const pdfPromise = new Promise((resolve, reject) => {
      writeStream.on("finish", () => {
        console.log("Enhanced PDF saved successfully at", pdfPath);
        resolve(pdfPath);
      });
      writeStream.on("error", reject);
    });

    const finalPdfPath = await pdfPromise;

    res.status(200).json({
      success: true,
      data: {
        examName: examData.name,
        questionCount: examData.questions.length,
        pdfPath: finalPdfPath,
        colorTheme: colorTheme,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Error generating exam PDF:", error);
    res.status(500).json({
      success: false,
      message: "Error occurred while generating exam PDF.",
      error: error.message
    });
  }
};

// Add new endpoint to fetch questions by priority tier
exports.getQuestionsByPriority = async (req, res) => {
  try {
    const { examId } = req.params;
    const { priority = 'high', limit = 10, page = 1 } = req.query;
    
    // Validate priority parameter
    const validPriorities = ['high', 'medium', 'low', 'all'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority value. Must be 'high', 'medium', 'low', or 'all'"
      });
    }
    
    // Build query filter
    const filter = { _id: examId };
    const questionFilter = priority === 'all' ? {} : { "questions.priority": priority };
    
    // Calculate pagination
    const skip = (page - 1) * limit;
    
    // Fetch exam with filtered questions
    const exam = await Exam.findOne(filter)
      .select('name questions')
      .lean();
      
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found"
      });
    }
    
    // Filter and paginate questions
    let filteredQuestions = priority === 'all' 
      ? exam.questions 
      : exam.questions.filter(q => q.priority === priority);
    
    // Sort by relevanceScore (highest first)
    filteredQuestions.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    
    const paginatedQuestions = filteredQuestions.slice(skip, skip + parseInt(limit));
    
    return res.status(200).json({
      success: true,
      data: {
        examId: exam._id,
        name: exam.name,
        questions: paginatedQuestions,
        pagination: {
          total: filteredQuestions.length,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(filteredQuestions.length / limit)
        }
      }
    });
  } catch (error) {
    console.error("Error fetching questions by priority:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch questions by priority",
      error: error.message
    });
  }
};

/**
 * Get summary of all questions associated with an ebook
 */
exports.getEbookQuestionsSummary = async (req, res) => {
  try {
    const { ebookId } = req.params;
    console.log("started getting questions for", ebookId);

    
    // Validate ebookId
    if (!ebookId || !mongoose.Types.ObjectId.isValid(ebookId)) {
      return res.status(400).json({
        success: false,
        message: "Valid ebook ID is required"
      });
    }
    
    // First, find the ebook to ensure it exists
    const ebook = await Story.findById(ebookId)
      .select('title questions')
      .lean();
      
    if (!ebook) {
      return res.status(404).json({
        success: false,
        message: "Ebook not found"
      });
    }
    
    // If ebook exists but has no questions
    if (!ebook.questions || ebook.questions.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          ebookTitle: ebook.title,
          totalQuestions: 0,
          exams: []
        }
      });
    }
    
    // Find all exams associated with this ebook
    const exams = await Exam.find({ 
      associatedEbook: ebookId 
    })
    .select('name status progress processingStatus category difficulty grade duration questions.topic questions.priority questions.relevanceScore questions.examFrequency questions.conceptCategory')
    .lean();
    
    // Process exams to get question summaries without content
    const processedExams = exams.map(exam => {
      // Group questions by topic
      const topicGroups = {};
      const priorityCount = { high: 0, medium: 0, low: 0 };
      
      // Process each question for statistics
      exam.questions.forEach(q => {
        // Count by topic
        if (!topicGroups[q.topic]) {
          topicGroups[q.topic] = 0;
        }
        topicGroups[q.topic]++;
        
        // Count by priority
        if (q.priority) {
          priorityCount[q.priority]++;
        }
      });
      
      // Calculate average relevance score
      const totalRelevance = exam.questions.reduce((sum, q) => 
        sum + (q.relevanceScore || 0), 0);
      const averageRelevance = exam.questions.length > 0 ? 
        Math.round(totalRelevance / exam.questions.length) : 0;
      
      return {
        examId: exam._id,
        name: exam.name,
        status: exam.status,
        progress: exam.progress,
        processingStatus: exam.processingStatus,
        category: exam.category,
        difficulty: exam.difficulty,
        grade: exam.grade,
        duration: exam.duration,
        questionCount: exam.questions.length,
        topics: Object.entries(topicGroups).map(([topic, count]) => ({ 
          topic, 
          count 
        })),
        priorityBreakdown: priorityCount,
        averageRelevance
      };
    });
    
    return res.status(200).json({
      success: true,
      data: {
        ebookTitle: ebook.title,
        ebookId: ebook._id,
        totalQuestions: exams.reduce((sum, exam) => sum + exam.questions.length, 0),
        totalExams: exams.length,
        exams: processedExams
      }
    });
  } catch (error) {
    console.error("Error fetching ebook questions summary:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch ebook questions summary",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};
