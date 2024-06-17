const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
const { AudioModule } = require("../../data/audioModules");
const { textToSpeech } = require("./tts");
const { generateSSML } = require("./ssmlTemplate");

const azureOpenai = async (query, systemInstruction, deployment) => {
  try {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_APIKEY;

    const client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));

    const result = await client.getChatCompletions(deployment, [
      {
        role: "system",
        content: systemInstruction,
      },
      { role: "user", content: JSON.stringify(query) },
    ]);

    return result.choices.map((choice) => choice.message.content).join("");
  } catch (err) {
    console.error("The sample encountered an error:", err);
  }
};

const chunkText = (text) => {
  if (text) {
    return text.trim().replace(/\s+/g, " ");
  } else {
    return "";
  }
};

const processTextChunks = async (
  previousPage,
  textChunks,
  module,
  moduleDescription,
  voiceActors
) => {
  try {
    const previousChunkedText = previousPage?.textChunks
    const chunkedText = textChunks.textChunks;
    if(chunkedText.length < 20){
      return null
    }
    const query = AudioModule(previousChunkedText, chunkedText, module, moduleDescription, voiceActors);
    const result = await azureOpenai(
      query,
      `
      You are specifically designed for creating audio resources from educational textbooks. Your task is to convert textbook material into engaging and clear audio content using Azure Text-to-Speech (TTS). Follow these guidelines to produce high-quality output:
      - Mathematical Values: Translate mathematical expressions into spoken language that clearly conveys the concept in an understandable manner.
      - Voice Roles and Dialogue: Assign distinct voices to different characters or sections, ensuring a seamless and natural dialogue flow without voice names being announced. you are only allowed to use the voice(s): ${voiceActors}
      ensure there are no other responses asides the output ex: output = {json data}, not output = "here's a json..{json data}", this is to ensure the json object can be parsed easily
`,
      "gpt4-omini"
    );

    return result;
  } catch (error) {
    console.error("Error processing text chunks:", error);
    throw error;
  }
};

const processAudioFiles = async (cleanedResultData, collection, index, module, voiceActors) => {
  try {
    const outputFile = `${cleanedResultData.title}.mp3`;
    const textChunks = cleanedResultData.textChunks
      ? cleanedResultData.textChunks
      : cleanedResultData.textChunk;
    const ssml = generateSSML(textChunks, module, voiceActors[0])
    // console.log("ssml:", ssml);
    
    const audioUrl = await textToSpeech(
      process.env.AZURE_SPEECH_API_KEY,
      "northcentralus",
      ssml,
      cleanedResultData.title,
      outputFile,
      collection,
      index
    );
    return audioUrl;
  } catch (error) {
    console.error("Error creating audio files:", error);
  }
};

module.exports = {
  azureOpenai,
  chunkText,
  processTextChunks,
  processAudioFiles,
};
