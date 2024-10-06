const csv = require("csvtojson");
const Exam = require("../Models/exam");

const createCustomExamCore = async (
  req,
  rows,
  name,
  category,
  grade,
  difficulty,
  description,
  duration,
  textChunks,
  image
) => {
  try{

    console.log("started createExamCore function");
    // Transform CSV row to match question schema
  const questions = [];
  rows.forEach((row) => {
    const question = {
      examBody: "kingsHeart",
      examClass: row.examClass,
      Institution: row.Institution || "kingsheart",
      course: row.course,
      topic: row.topic,
      difficulty: row.difficulty,
      question: row.question,
      options: row.options,
      correctOption: row.correctOption,
      explanation:
        row.explanation || "no official explanation is available at this time",
      reference: row.reference || "no reference was provided for this question",
      image: row.image || null,
    };
    questions.push(question);
  });
  // [
  //   row["options[0]"],
  //   row["options[1]"],
  //   row["options[2]"],
  //   row["options[3]"],
  // ].map((option) => option.trim())
  //  [row.options[0], row.options[1], row.options[2], row.options[3]].map(option => option.trim())
  console.log('questions: ', questions);
  
  const exam = await Exam.create({
    name,
    image,
    category,
    grade,
    difficulty,
    questions,
    author: {
      _id: req.user.id,
      username: req.user.username,
      photo: req.user.photo,
    },
    duration,
    description,
    textChunks
  });
  await exam.save();
  return {
    collection: exam,
  }
}catch(err){
  console.log(err);
  throw err
}
};

const editCustomExamCore = async(rows, exam) => {
  try{
    // Transform rows into questions and append to newQuestions array
    const newQuestions = []
    rows.forEach((row) => {
      const question = {
      examBody: "kingsHeart",
      examClass: row.examClass,
      Institution: row.Institution || "kingsheart",
      course: row.course,
      topic: row.topic,
      difficulty: row.difficulty,
      question: row.question,
      options: row.options,
      correctOption: row.correctOption,
      explanation:
        row.explanation ||
        "no official explanation is available at this time",
      reference: row.reference,
      image: row.image || null,
    };
    newQuestions.push(question);
  });
  
  // Append new questions to the existing exam questions
  exam.questions = exam.questions.concat(newQuestions);
  
  // Save the updated exam
  await exam.save();
}catch(err){
  console.log(err)
  throw err
}
}
const createCustomExam = async (req, res) => {
  try {
    const {
      name,
      category,
      grade,
      difficulty,
      description,
      duration,
      JsonQuestions,
    } = req.body;
    const examImage = req.fileLink;
    const csvFile = req.files["csvFile"][0];

    if ((!name && !examImage && !JsonQuestions) || !csvFile) {
      return res.status(400).json({
        message: "Name, examImage, and csvFile or JsonQuestions are required",
      });
    }

    const bufferString = !JsonQuestions
      ? csvFile.buffer.toString("utf-8")
      : null;

    // Parse CSV data
    const rows = !JsonQuestions
      ? await csv().fromString(bufferString)
      : JsonQuestions;

    if (!rows) {
      return res.status(400).json({
        success: false,
        message: "csvFile was not passed correctly or no question was provided",
      });
    }
    createCustomExamCore(
      req,
      rows,
      name,
      category,
      grade,
      difficulty,
      description,
      duration
    );
    res.status(200).json({
      success: true,
      message: "Exam created successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      errorMessage: error.message,
    });
  }
};

const addMoreQuestions = async (req, res) => {
  try {
    const { examId, JsonQuestions } = req.body;
    const csvFile = req.files ? req.files["csvFile"][0] : null;

    if (!examId || (!JsonQuestions && !csvFile)) {
      return res.status(400).json({
        message: "Exam ID and either CSV file or JSON questions are required",
      });
    }

    // Find the existing exam by ID
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    let bufferString = null;

    // If JSON questions are not provided, parse CSV
    if (!JsonQuestions && csvFile) {
      bufferString = csvFile.buffer.toString("utf-8");
    }

    // Parse CSV or JSON data
    const rows = JsonQuestions
      ? JsonQuestions
      : await csv().fromString(bufferString);

    if (!rows) {
      return res.status(400).json({
        success: false,
        message: "csvFile was not passed correctly or no question was provided",
      });
    }
    editCustomExamCore(rows, exam)
    res.status(200).json({
      success: true,
      message: "Questions added successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      errorMessage: error.message,
    });
  }
};

const getCustomExam = async (req, res) => {
  try {
    const ExamId = req.params.examId;

    const exam = await Exam.findById(ExamId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        errorMessage: "exam not found",
      });
    }

    res.status(200).json({ exam });
  } catch (error) {
    res.status(500).json({
      success: false,
      errorMessage: error.message,
    });
  }
};

const getAllCustomExams = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const searchTerm = req?.query?.search?.trim();
    const pageSize = 10;
    const examCount = await Exam.countDocuments();
    const maxPages = Math.ceil(examCount / pageSize);

    if (page - 1 > maxPages) {
      return res.status(404).json({
        errorMessage: "max-pages exceeded",
      });
    }

    let pipeline = [
      {
        $project: {
          name: 1,
          date: 1,
          grade: 1,
          category: 1,
          difficulty: 1,
          image: 1,
          questionLength: { $size: "$questions" },
        },
      },
      {
        $sort: { createdAt: -1, _id: 1 },
      },
      {
        $skip: (page - 1) * pageSize,
      },
      {
        $limit: pageSize,
      },
    ];

    if (searchTerm) {
      pipeline.unshift({
        $match: { name: { $regex: new RegExp(`^${searchTerm}$`, "i") } },
      });
    }

    const allExams = await Exam.aggregate(pipeline);

    if (!allExams) {
      return res.status(404).json({
        success: false,
        errorMessage: "exam not found",
      });
    }

    res.status(200).json({ allExams, maxPages });
  } catch (error) {
    res.status(500).json({
      success: false,
      errorMessage: error.message,
    });
  }
};

module.exports = {
  createCustomExam,
  addMoreQuestions,
  getCustomExam,
  getAllCustomExams,
  createCustomExamCore,
  editCustomExamCore
};
