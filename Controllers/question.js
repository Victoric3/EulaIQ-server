const fetch = require("node-fetch");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const Exam = require("../Models/exam");
const { processTextChunks } = require("../Helpers/Libraries/azureOpenai");
const { handleTextProcessing } = require("../Controllers/file");
const { createCustomExamCore, editCustomExamCore } = require("./exam");

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

const processRemainingQuestions = async (
  index,
  collection,
  processGuide,
  res
) => {
  const {
    examClass,
    institution,
    course,
    topic,
    firstResult,
    previousPage,
    questionType,
    questionDescription,
  } = processGuide;
  const textChunks = collection?.textChunks;

  if (index < textChunks.length) {
    try {
      const result = await processTextChunks(
        index === 1 ? firstResult : previousPage,
        textChunks[index],
        questionType,
        questionDescription,
        null,
        textChunks.length - 1 == index,
        "question",
        `
      You are specifically designed for creating question resources from educational textbooks. Your task is to convert textbook material into useful questions.
      Ensure there are no other responses aside from the questions, e.g., output = {json data}, not output = "here's a json...{json data}", this is to ensure the json object can be parsed easily.
      `,
        res
      );

      const rows = [];
      result.questions.forEach((questionObj) => {
        // Add additional fields to each question
        const modifiedQuestion = {
          examClass: examClass,
          Institution: institution || "Kingsheart",
          course: course,
          topic: topic,
          difficulty: questionObj.difficulty,
          question: questionObj.question,
          options: questionObj.options,
          correctOption: questionObj.correctOption,
          explanation: questionObj.explanation,
          reference: questionObj.reference,
          image: null,
        };

        // Push the modified question into rows array
        rows.push(modifiedQuestion);
      });
      console.log(rows);
      await editCustomExamCore(rows, collection);
      // Emit progress for the frontend
      res.io.emit("question-progress", {
        message: `Successfully generated questions for page ${index + 1}`,
        currentIndex: index + 1,
      });
      console.log(`Finished processing chunk ${index}`);

      // Process the next chunk
      await processRemainingQuestions(
        index + 1,
        collection,
        {
          ...processGuide,
          previousPage: collection.textChunks[index],
        },
        res
      );
    } catch (error) {
      console.error(`Error processing chunk ${index}:`, error);
      res.io.emit("question-error", {
        message: `Error processing chunk ${index}`,
        error: error.message,
      });
    }
  } else {
    res.status(200).json({
      message: "Successfully generated all questions",
      collection,
    });
  }
};

exports.handleQuestionGeneration = async (req, res) => {
  try {
    const file = req.uploadedFile;
    const image = null;
    const {
      questionType,
      questionDescription,
      text,
      examClass,
      institution,
      course,
      topic,
      category,
      grade,
      difficulty,
      duration,
      name,
    } = req.body;
    const { textChunks, description } = await handleTextProcessing(
      questionType,
      questionDescription,
      file,
      text,
      "question",
      res
    );
    // console.log("textChunks.length: ", textChunks.length);
    // console.log("textChunksFinal: ", textChunks);
    // return res.status(200).json({
    //   textChunks,
    // });

    if (text?.length > 0) {
      textChunks.unshift(text);
      console.log("textChunks with text: ", textChunks);
    } else if (textChunks.length === 0) {
      return res
        .status(400)
        .json({ message: "we couldn't extract any text from the file" });
    }
    const firstResult = await processTextChunks(
      null,
      textChunks[0],
      questionType,
      questionDescription,
      null,
      false,
      "question",
      `
      You are specifically designed for creating question resources from educational textbooks. Your task is to convert textbook material into usefull questions.
      Ensure there are no other responses aside from the questions, e.g., output = {json data}, not output = "here's a json...{json data}", this is to ensure the json object can be parsed easily.
      `,
      res
    );
    const rows = [];
    firstResult.questions.forEach((questionObj) => {
      //a new object for each question, adding the required fields
      const modifiedQuestion = {
        examClass: examClass,
        Institution: institution || "Kingsheart",
        course: course,
        topic: topic,
        difficulty: questionObj.difficulty,
        question: questionObj.question,
        options: questionObj.options,
        correctOption: questionObj.correctOption,
        explanation: questionObj.explanation,
        reference: questionObj.reference,
        image: null,
      };

      // Push the modified question into the rows array
      rows.push(modifiedQuestion);
    });
    // console.log("firsttextChunk: ", textChunks[0]);
    console.log("firsttextResult: ", firstResult);
    // return res.status(200).json({ firstResult });

    const { collection } = await createCustomExamCore(
      req,
      rows,
      name,
      category,
      grade,
      difficulty,
      description.introduction,
      duration,
      textChunks,
      image
    );

    // If more than one text chunk, process the remaining chunks
    if (textChunks.length > 1) {
      //temporary!!!! to falsify the conditional for testing
      await processRemainingQuestions(
        1,
        collection, // Pass the collection with textChunks
        {
          examClass,
          institution,
          course,
          topic,
          previousPage: textChunks[0],
          questionType,
          questionDescription,
        },
        res
      );
    } else {
      res.status(200).json({
        message: "Successfully generated all questions",
        rows,
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.continueQuestionGeneration = async (req, res) => {
  const {
    collectionId,
    examClass,
    institution,
    course,
    topic,
    questionType,
    questionDescription,
  } = req.body;

  try {
    // Find the collection by its ID
    const collection = await Exam.findById(collectionId);
    if (!collection) {
      return res.status(404).json({ error: "Collection not found" });
    }

    const currentIndex = Math.floor(collection.questions.length / 10) + 1;
    // const currentIndex = 30;
    console.log("currentIndex: ", currentIndex);
    // Start processing remaining text chunks for question generation
    await processRemainingQuestions(
      currentIndex,
      collection,
      {
        examClass,
        institution: institution || "Kingsheart",
        course,
        topic,
        firstResult: collection.textChunks[0],
        previousPage: collection.textChunks[currentIndex - 1],
        questionType,
        questionDescription,
      },
      res
    );
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      error: "An error occurred while continuing question generation",
    });
  }
};

exports.fetchExamData = async (req, res) => {
  try {
    const { name, QandA = false } = req.body;

    // Fetch exam data by the exam name
    const examData = await Exam.findOne({ name });

    if (!examData || examData.length === 0) {
      return res
        .status(200)
        .json({ errorMessage: `No exam found with the name "${name}"` });
    }

    let questions = "";
    let answers = "";

    // Loop through the questions and format them
    examData.questions.forEach((exam, index) => {
      // Format the question section
      questions += `\nQuestion ${index + 1}:\n${exam.question}\n`;

      // Add options based on QandA parameter
      if (QandA) {
        exam.options.forEach((option, i) => {
          const optionLetter = String.fromCharCode(65 + i); // A, B, C, D...
          questions += `${optionLetter}: ${option}\n`;
        });

        const correctOptionIndex = parseInt(exam.correctOption, 10);
        const correctOptionLetter = String.fromCharCode(
          65 + correctOptionIndex
        );

        questions += `Correct Answer: ${correctOptionLetter}\n`;
        questions += `Explanation: ${exam.explanation}\n`;
        questions += `Reference: ${exam.reference}\n`;
      }

      // Traditional answer formatting (separate from questions)
      if (!QandA) {
        exam.options.forEach((option, i) => {
          const optionLetter = String.fromCharCode(65 + i); // A, B, C, D...
          questions += `${optionLetter}: ${option}\n`;
        });

        const correctOptionIndex = parseInt(exam.correctOption, 10);
        // Format the answers and explanations section
        const correctOptionLetter = String.fromCharCode(
          65 + correctOptionIndex
        ); // A, B, C, D
        answers += `\nAnswer ${index + 1}: ${correctOptionLetter}\n`;
        answers += `Explanation: ${exam.explanation}\n`;
        answers += `Reference: ${exam.reference}\n\n`;
      }
    });

    // Construct the final output with clean line breaks
    const formattedResponse = QandA
      ? `Exam Questions With Answers:\n${questions}`
      : `Questions:\n${questions}\nAnswers:\n${answers}`;

    // --- Create PDF and save it locally ---
    const doc = new PDFDocument();
    const pdfPath = path.join(__dirname, `${name}-${QandA && 'QandA'}.pdf`);

    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // Write the content to the PDF
    doc.fontSize(16).text(`Exam Questions On ${name}`, { underline: true });
    doc.fontSize(12).moveDown().text(questions);

    if (!QandA) {
      doc.fontSize(16).text("Answers", { underline: true });
      doc.fontSize(12).moveDown().text(answers);
    }

    // Finalize the PDF and close the stream
    doc.end();

    writeStream.on("finish", () => {
      console.log("PDF saved successfully at", pdfPath);
    });

    // Send the JSON response to Postman
    res.status(200).json({
      generatedQuestions: formattedResponse,
      pdfPath: pdfPath, // Return the PDF path if needed
    });
  } catch (error) {
    console.error("Error fetching exam data:", error);
    res.status(500).json({
      errorMessage: "Error occurred while fetching exam data.",
    });
  }
};
