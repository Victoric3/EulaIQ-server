const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
const { queryCreator } = require("../../data/audioModules");
const { textToSpeech } = require("./tts");
const { generateSSML } = require("./ssmlTemplate");
const { extractAndParseJSON } = require("../input/escapeStrinedJson");

const azureOpenai = async (query, systemInstruction, deployment) => {
  try {
    console.log("started querying azure");
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_APIKEY;
    console.log("endpoint: ", endpoint);

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
  voiceActors,
  lastpart,
  type,
  systemInstruction,
  res
) => {
  let attempts = 0;
  const maxRetries = 3;
  console.log("called process textchunks");

  const callProcessTextChunks = async () => {
    let result;
    if (textChunks.length < 20) {
      result =
        module == "audio"
          ? `{
        textChunks: [
        { 
          voice: ${voiceActor[0] || "en-US-NovaMultilingualNeural"},
          text: "this page looks empty it only contains: ${textChunks}",
          keywords: [empty],
        }
      ]
    }`
          : `{questions: []}`;
    } else {
      const query = queryCreator(
        previousPage,
        textChunks,
        module,
        moduleDescription,
        voiceActors,
        lastpart,
        type
      );

      console.log('query: ', query)
      result = await azureOpenai(query, systemInstruction, "gpt-4o-mini");
    }
    // Clean GPT-4's result for audio generation
    const cleanedResultData = extractAndParseJSON(result);
    // console.log("cleanedResultData: ", cleanedResultData);

    return cleanedResultData;
  };

  try {
    let result = null;

    while (attempts < maxRetries) {
      result = await callProcessTextChunks();
      if (result != null) {
        break; // If result is valid, exit the loop
      }
      attempts++;
      console.log(`Attempt ${attempts} failed, retrying...`);
    }

    if (result == null) {
      console.error("Max retries reached, could not process text chunks.");
      throw new Error("Max retries reached, could not process text chunks.")
    }

    // Continue with further processing using the valid result
    console.log("Successfully processed text chunks:", result);
    // (You would add the rest of your code here to handle the successful result)
    return result;
  } catch (error) {
    console.error(`Attempt ${attempts} - Error processing text chunks:`, error);

    if (
      error.response &&
      (error.response.status === 429 || error.response.status === 500)
    ) {
      res.io.emit("audio-retry", {
        message: `Retry attempt ${attempts} due to ${error.response.status}`,
        status: error.response.status,
      });
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));

      if (attempts < maxRetries) {
        return await processTextChunks(
          previousPage,
          textChunks,
          module,
          moduleDescription,
          voiceActors,
          lastpart,
          res
        );
      } else {
        throw new Error("Max retries reached");
      }
    } else {
       throw error;
    }
  }
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
  console.log("generating audio files");
  const callCreateAudio = async () => {
    const outputFile = `${(index + 1).toString().padStart(2, "0")}-${
      collection.title.length < 30
        ? collection.title
        : collection.title.slice(0, 30)
    }.mp3`;
    const textChunks = cleanedResultData?.textChunks
      ? cleanedResultData.textChunks
      : cleanedResultData.textChunk;
    const ssml = generateSSML(textChunks, module);

    const audioUrl = await textToSpeech(
      process.env.AZURE_SPEECH_API_KEY,
      "northcentralus",
      ssml,
      collection.title,
      outputFile,
      collection,
      index,
      //remember to correct the addition of voice actors here
      module === voiceActors.length > 1
        ? voiceActors.join(", ")
        : voiceActors[0]
    );
    return audioUrl;
  };
  try {
    const audioUrl = await callCreateAudio();
    return audioUrl;
  } catch (error) {
    attempts++;
    console.error(`Attempt ${attempts} - Error creating audio files:`, error);

    res.io.emit("audio-retry", {
      message: `Retry attempt ${attempts} due to ${error.response.status}`,
      status: error.response.status,
    });
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
    if (attempts <= maxRetries) {
      const audioUrl = await callCreateAudio();
      return audioUrl;
    } else {
      return res.status(400).json({ errorMessage: "max-retries reached" });
    }
  }
};

module.exports = {
  azureOpenai,
  chunkText,
  processTextChunks,
  processAudioFiles,
};
