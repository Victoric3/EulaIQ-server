const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
const { AudioModule } = require("../../data/audioModules");
const { textToSpeech } = require("./tts");
const { generateSSML } = require("./ssmlTemplate");
const { extractAndParseJSON } = require("../input/escapeStrinedJson");

const azureOpenai = async (query, systemInstruction, deployment) => {
  try {
    console.log("started querying azure");
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_APIKEY;
    console.log("endpoint: ", endpoint);
    console.log("apiKey: ", apiKey);

    const client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));

    const result = await client.getChatCompletions(deployment, [
      {
        role: "system",
        content: systemInstruction,
      },
      { role: "user", content: JSON.stringify(query) },
    ]);
    console.log("result: ", result);

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
  voiceActors,
  res
) => {
  let attempts = 0;
  const maxRetries = 3;

  while (attempts < maxRetries) {
    try {
      if (textChunks.length < 20) {
        throw new Error("Insufficient text chunks for processing");
      }

      const query = AudioModule(
        previousPage,
        textChunks,
        module,
        moduleDescription,
        voiceActors
      );

      const result = await azureOpenai(
        query,
        `
        You are specifically designed for creating audio resources from educational textbooks. Your task is to convert textbook material into engaging and clear audio content using Azure Text-to-Speech (TTS). Follow these guidelines to produce high-quality output:
        - Mathematical Values: Translate mathematical expressions into spoken language that clearly conveys the concept in an understandable manner.
        - Voice Roles and Dialogue: Assign distinct voices to different characters or sections, ensuring a seamless and natural dialogue flow without voice names being announced. you are only allowed to use the voice(s): ${voiceActors}
        ensure there are no other responses asides the output ex: output = {json data}, not output = "here's a json..{json data}", this is to ensure the json object can be parsed easily
        `,
        "gpt-4o"
      );

      // Clean gpt4's result for audio generation
      const cleanedResultData = extractAndParseJSON(result);
      return cleanedResultData;
    } catch (error) {
      attempts++;
      console.error(`Attempt ${attempts} - Error processing text chunks:`, error);

      if (error.response && (error.response.status === 429 || error.response.status === 500)) {
        res.io.emit('audio-retry', {
          message: `Retry attempt ${attempts} due to ${error.response.status}`,
          status: error.response.status,
        });
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      } else {
        throw error;
      }
    }
  }

  throw new Error("Max retries reached for processing text chunks");
};



const processAudioFiles = async (
  cleanedResultData,
  collection,
  index,
  module,
  voiceActors,
  res
) => {
  let attempts = 0;
  const maxRetries = 3;

  while (attempts < maxRetries) {
    try {
      const outputFile = `${cleanedResultData?.title}.mp3`;
      const textChunks = cleanedResultData.textChunks ? cleanedResultData.textChunks : cleanedResultData.textChunk;
      const ssml = generateSSML(textChunks, module, voiceActors[0]);

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
      attempts++;
      console.error(`Attempt ${attempts} - Error creating audio files:`, error);

      if (error.response && (error.response.status === 429 || error.response.status === 500)) {
        res.io.emit('audio-retry', {
          message: `Retry attempt ${attempts} due to ${error.response.status}`,
          status: error.response.status,
        });
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      } else {
        throw error;
      }
    }
  }

  throw new Error("Max retries reached for creating audio files");
};



module.exports = {
  azureOpenai,
  chunkText,
  processTextChunks,
  processAudioFiles,
};
