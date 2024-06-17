const csv = require('csvtojson');
const Exam = require('../Models/exam');


const createCustomExam = async (req, res) => {
    try {
      const { 
        name, 
        category,
        grade,
        difficulty,
        description,
        duration,
        JsonQuestions
       } = req.body;
      const examImage = req.fileLink;
      const csvFile = req.files['csvFile'][0];
       
      
      if (!name && !examImage && !JsonQuestions || !csvFile) {
        return res.status(400).json({ message: 'Name, examImage, and csvFile or JsonQuestions are required' });
      }
      
      const questions = [];
      const bufferString = !JsonQuestions ? csvFile.buffer.toString('utf-8') : null

      
      // Parse CSV data
        const rows = !JsonQuestions ? await csv().fromString(bufferString) : JsonQuestions
        
        if(!rows){
          return res.status(400).json({
            success: false,
            message: 'csvFile was not passed correctly or no question was provided'
          })
        }
          // Transform CSV row to match question schema
         rows.forEach((row) =>  {
          const question = {
            examBody: "kingsHeart",
            examClass: row.examClass,
            Institution: row.Institution || "kingsheart",
            course: row.course,
            topic: row.topic,
            difficulty: row.difficulty,
            question: row.question,
            options: [row['options[0]'], row['options[1]'], row['options[2]'], row['options[3]']].map(option => option.trim()),
            correctOption: row.correctOption,
            explanation: row.explanation || "no official explanation is available at this time",
            image: row.image || null,
          }
          questions.push(question);
        })
        //  [row.options[0], row.options[1], row.options[2], row.options[3]].map(option => option.trim())
       

        const exam = await Exam.create({ 
            name, 
            image: examImage, 
            category,
            grade,
            difficulty,
            questions,
            author: {
                _id: req.user.id,
                username: req.user.username,
                photo: req.user.photo
            },
            duration,
            description
        });
          await exam.save();
  
          res.status(200).json({ 
            success: true,
            message: 'Exam created successfully' 
          });
        

    } catch (error) {
      console.log(error);
      res.status(500).json({         
        success: false,
        errorMessage: error.message });
    }
  };

  const getCustomExam = async (req, res) => {
    try{
      const ExamId = req.params.examId

      const exam = await Exam.findById(ExamId)
      if(!exam){
        return res.status(404).json({
          success: false,
          errorMessage: 'exam not found'
        })
      }

      res.status(200).json({ exam })

    }catch(error){
      res.status(500).json({
        success: false,
        errorMessage: error.message
      })
    }

    
  }
  
  const getAllCustomExams = async (req, res) => {
    try{
      const page = parseInt(req.query.page) || 1;
      const searchTerm = req?.query?.search?.trim();
      const pageSize = 10;
      const examCount = await Exam.countDocuments()
      const maxPages = Math.ceil(examCount / pageSize)
      
      if(page - 1 > maxPages){
        return res.status(404).json({
          errorMessage: 'max-pages exceeded'
        })
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
                questionLength: { $size: '$questions' }
            }
        },
        {
            $sort: { createdAt: -1, _id: 1 }
        },
        {
            $skip: (page - 1) * pageSize
        },
        {
            $limit: pageSize
        }
    ];
    
    if (searchTerm) {
      pipeline.unshift({
          $match: { name: { $regex: new RegExp(`^${searchTerm}$`, 'i') } }
      });
  }
  
    
    const allExams = await Exam.aggregate(pipeline);

      if(!allExams){
        return res.status(404).json({
          success: false,
          errorMessage: 'exam not found'
        })
      }

      res.status(200).json({ allExams, maxPages })

    }catch(error){
      res.status(500).json({
        success: false,
        errorMessage: error.message
      })
    }

    
  }

  

  module.exports = {createCustomExam, getCustomExam, getAllCustomExams}