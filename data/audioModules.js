const output = (module, voiceActor) => {

  if (module === "Dialogic/Conversational") {
    return `{
    title: "a 2word caption"
    textChunks: [
      { 
        voice: ${voiceActor[0] || "en-US-NovaMultilingualNeural"} //ensure to use this voice,
        text: "content",
        keywords: [{word: "the word from the text" emphasis: "strong, moderate or reduced"}],
      },
      {
        voice: ${voiceActor[1] || "en-US-FableMultilingualNeural"} //ensure to use this voice,
        //repeat second speaker, and continue repeating for entire material
      }
    ]}`;
  } else {
    return `{
    title: "a 2word caption"
    textChunk:{
        speaker: ${voiceActor[0] || "en-US-AlloyMultilingualNeural"} //ensure to use this voice",
        text: "content",
        keywords: [{word: "the word from the text" emphasis: "strong, moderate or reduced"}],
    }
  }`;
  }
};

const AudioModule = (
  previousPage,
  currentPage,
  module,
  moduleDescription,
  voiceActors
) => {
  return {
    task: `create ${module} audio`,
    description: `Generate a json data that improves a material. The json data should contain text derived from educational material without omitting any details but making it ${module}- this means ${moduleDescription}, also ensure to discuss all parts of the material.`,
    previousPage,
    currentPage,
    output: output(module, voiceActors),
  };
};

const describe = (firstTextChunk, module, moduleDescription) => {
  return {
    task: `generate a decription for an audio collection`,
    description: `Generate a json data that describes a material. The json object should serve as an introduction to the material. the material is in the form ${module}- this means ${moduleDescription}`,
    requirements: {
      introduction: `a single string NOT array of objects of textual data less than 100words, it should give an overview of what the material is going to talk about, describing the module(${module}) used in very simple language`,
      extractionEfficiency: `a boolean that tells how efficient the text extraction was, false will mean that advanced ocr should be used because the accuracy of extraction is poor`,
    },
    output: "A json object following the specified requirements.",
    material: firstTextChunk,
  };
};

module.exports = { AudioModule, describe };
