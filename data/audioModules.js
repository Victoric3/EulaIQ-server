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

const AudioModule = (
  previousPage,
  currentPage,
  module,
  moduleDescription,
  voiceActors,
  lastPart,
  materialIsSmall
) => {
  return {
    task: `create ${module} audio`,
    description: materialIsSmall
      ? `return "this page looks empty it only contains: ${currentPage}" as the text, do not add or omit anything`
      : `Generate a json data that improves a material. The json data should contain text derived from educational material without omitting any details but making it ${module}, ${moduleDescription}, this is ${
          previousPage == null ? "" : "not"
        } the first page, ${
          previousPage == null ? "" : "do not"
        } write an introduction like a greeting "hello there or something else" ${
          previousPage == null
            ? ""
            : "simply continue from were you stoped in the previous page, don't say lets continue, just start with the next word after the last word in the previous page"
        }, and this is ${!lastPart && "not "} the last part so ${
          !lastPart && "do not "
        } make a conclusion at the ending of the material, also ensure to discuss all parts of the material.`,
    previousPage: materialIsSmall ? "" : previousPage,
    currentPage: materialIsSmall ? "" : currentPage,
    output: output(voiceActors),
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
