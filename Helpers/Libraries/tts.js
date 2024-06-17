const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { BlobServiceClient } = require("@azure/storage-blob");
const { Buffer } = require("buffer");
const { PassThrough } = require("stream");
const fs = require("fs");
const Audio = require("../../Models/Audio");
const AudioCollection = require("../../Models/AudioCollection")
/**
 * Function to upload a local file to Azure Blob Storage
 * @param {*} containerClient ContainerClient object
 * @param {*} blobName string, includes file extension if provided
 * @param {*} localFilePath fully qualified path and file name
 */
const uploadBlobFromLocalPath = async (
  containerClient,
  blobName,
  localFilePath
) => {
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadFile(localFilePath);
};

/**
 * Node.js server code to convert text to speech
 * @returns stream or URL
 * @param {*} key your resource key
 * @param {*} region your resource region
 * @param {*} ssml SSML string to convert to audio/speech
 * @param {*} title title of the file to be used in the blob name
 * @param {*} filename optional - best for long text - temp file for converted speech/audio
 */

// process.env.AZURE_SPEECH_API_KEY,
//       "northcentralus",
//       cleanedResultData.textChunk,
//       cleanedResultData.title,
//       outputFile,
//       collection,
//       index
const textToSpeech = async (
  key,
  region,
  ssml,
  title,
  filename,
  collection,
  index
) => {
  try {
    const audioCollection = await AudioCollection.findById(collection._id)
    // console.log(audioCollection);
    // convert callback function to promise
    return new Promise((resolve, reject) => {
      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
      speechConfig.speechSynthesisOutputFormat =
        sdk.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3; // mp3 format
      // speechConfig.speechSynthesisVoiceName = "en-US-AvaMultilingualNeural";

      let audioConfig = null;

      if (filename) {
        audioConfig = sdk.AudioConfig.fromAudioFileOutput(filename);
      }

      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

      synthesizer.speakSsmlAsync(
        ssml,
        async (result) => {
          const { audioData } = result;
          console.log("audioData: ", audioData);
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            console.log("synthesis finished.");
          } else {
            console.error("Speech synthesis canceled, " + result.errorDetails);
          }
          synthesizer.close();

          if (filename) {
            // Write to file
            fs.writeFileSync(filename, Buffer.from(audioData));

            try {
              // Upload the file to Blob Storage
              const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
              const blobName = `${title}-${timestamp}.mp3`;
              const encodedBlobName = encodeURIComponent(blobName);
              const blobServiceClient = BlobServiceClient.fromConnectionString(
                process.env.AZURE_STORAGE_CONNECTION_STRING
              );
              const containerClient = blobServiceClient.getContainerClient(
                process.env.CONTAINER_NAME
              );
              await uploadBlobFromLocalPath(
                containerClient,
                blobName,
                filename
              );

              // Clean up the temp file
              fs.unlinkSync(filename);

              const audioUrl = `https://${blobServiceClient.accountName}.blob.core.windows.net/${process.env.CONTAINER_NAME}/${encodedBlobName}`;

              const newAudio = new Audio({
                title,
                text: ssml,
                audioUrl,
                audioCollection: collection._id,
                index,
              });
              audioCollection.audios.push({
                index,
                audioId: newAudio._id
              });
              await audioCollection.save();
              // Save the new audio to the database
              await newAudio.save();
              // Save the new audio to the creator
              // Return the URL of the uploaded blob
              resolve(audioUrl);
            } catch (uploadError) {
              reject(uploadError);
            }
          } else {
            // Return stream from memory
            const bufferStream = new PassThrough();
            bufferStream.end(Buffer.from(audioData));
            resolve(bufferStream);
          }
        },
        (error) => {
          synthesizer.close();
          reject(error);
        }
      );
    });
  } catch (err) {
    console.error(err);
    throw err; // Re-throw the error to ensure it propagates correctly
  }
};

module.exports = {
  textToSpeech,
};
