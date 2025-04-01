const output = (voiceActor) => {
  return `{
    textChunks: [
      { 
        voice: ${
          voiceActor[0] || "en-US-NovaMultilingualNeural"
        } //ensure to use this voice,
        text: "content",
        keywords: [{word: "the word from the text" emphasis: "strong, moderate or reduced"}],
      },
      {
        voice: ${
          voiceActor[1] || voiceActor[0] || "en-US-NovaMultilingualNeural"
        } //ensure to use this voice,
        //repeat second speaker, and continue repeating for entire material
      }
    ]}`;
};

// Update the mcqQuestionStructure function to include priority fields
const mcqQuestionStructure = () => {
  return `
    {
      "questions": [
        {
          "question": "string, the question statement",
          "options": ["string1", "string2", "string3", "string4"],
          "correctOption": "number (0-3), index of the correct option",
          "explanation": "string, detailed explanation of why the answer is correct",
          "reference": "string, specific part of the content where this is from",
          "difficulty": "string (easy, medium, hard)",
          "priority": "string (high, medium, low) based on clinical importance",
          "relevanceScore": "number (0-100) indicating the importance score",
          "examFrequency": "string (very common, common, uncommon, rare)",
          "conceptCategory": "string (category of medical concept)"
        }
      ]
    }`;
};

const queryCreator = (
  previousPage,
  currentPage,
  module,
  moduleDescription,
  voiceActors,
  lastPart,
  type
) => {
  if (type === "audio") {
    return {
      task: `create ${module} audio`,
      description: `Generate a json data that improves a material. The json data should contain text derived from educational material without omitting any details but making it ${module}, ${moduleDescription}, this is ${
        previousPage == null ? "" : "not"
      } the first page, ${
        previousPage == null ? "" : "do not"
      } write an introduction like a greeting "hello there or something else" ${
        previousPage == null
          ? ""
          : "simply continue from were you stoped in the previous page, don't say lets continue, just start with the next word after the last word in the previous page"
      }, and this is ${!lastPart && "not "} the last part so ${
        !lastPart && "do not "
      } make a conclusion at the ending of the material, also ensure to discuss all parts of the material. i have added the previous page and current page to give context of what must have been talked about prevoiusly`,
      previousPage: previousPage,
      currentPage: currentPage,
      output: output(voiceActors),
    };
  } else {
    return {
      task: `create ${module} questions`,
      description: `Generate json data of ${module} questions this means ${moduleDescription}, the json data should have the following structure ${mcqQuestionStructure()}`,
      previousPage: previousPage,
      currentPage: currentPage,
    };
  }
};

const describe = (firstTextChunk, module, moduleDescription, type) => {
  return {
    task: `generate a decription for an ${type} resource`,
    description: `Generate a json data that describes a material. The json object should serve as an introduction to the material. the material is in the form ${module}- this means ${moduleDescription}, if the current page doesn't contain any meaningful information which can be used to generate question, return "{questions: []}" as your output`,
    requirements: {
      introduction: `a single string NOT array of objects of textual data less than 100words, it should give an overview of what the material is going to talk about, describing the module(${module}) in very simple language`,
      extractionEfficiency: `a boolean that tells if the extracted text seems accurate amd will be efficiently understood by ai, false will mean that advanced ocr should be used because the accuracy of extraction is poor`,
    },
    output: "A json object following the specified requirements.",
    material: firstTextChunk,
  };
};

module.exports = { queryCreator, describe, mcqQuestionStructure };
