const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { BlobServiceClient } = require("@azure/storage-blob");
const { Buffer } = require("buffer");
const { PassThrough } = require("stream");
const fs = require("fs");
const Audio = require("../../Models/Audio");
const AudioCollection = require("../../Models/AudioCollection");

// Function to upload a local file to Azure Blob Storage
const uploadBlobFromLocalPath = async (
  containerClient,
  blobName,
  localFilePath
) => {
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadFile(localFilePath);
};

// Function to calculate audio duration
const calculateDuration = async (filePath) => {
  const mm = await import("music-metadata");
  const metadata = await mm.parseFile(filePath);
  return metadata.format.duration;
};

// Function to convert text to speech
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
    const audioCollection = await AudioCollection.findById(collection._id);
    return new Promise((resolve, reject) => {
      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
      speechConfig.speechSynthesisOutputFormat =
        sdk.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3;

      let audioConfig = null;

      if (filename) {
        audioConfig = sdk.AudioConfig.fromAudioFileOutput(filename);
      }

      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

      synthesizer.speakSsmlAsync(
        ssml,
        async (result) => {
          const { audioData } = result;
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            console.log("synthesis finished.");
          } else {
            console.error("Speech synthesis canceled, " + result.errorDetails);
          }
          synthesizer.close();

          if (filename) {
            fs.writeFileSync(filename, Buffer.from(audioData));
            try {
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

              const audioUrl = `https://${blobServiceClient.accountName}.blob.core.windows.net/${process.env.CONTAINER_NAME}/${encodedBlobName}`;
              const duration = await calculateDuration(filename);

              const newAudio = new Audio({
                title,
                text: ssml,
                audioUrl,
                audioCollection: collection._id,
                index,
                audioDuration: duration,
              });
              audioCollection.playtime =
                (audioCollection.playtime || 0) + duration;
              audioCollection.audios.push({
                index,
                audioId: newAudio._id,
                audioDuration: duration,
              });
              await audioCollection.save();
              await newAudio.save();

              fs.unlinkSync(filename);

              resolve({audioUrl, audioCollection});
            } catch (uploadError) {
              reject(uploadError);
            }
          } else {
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
    throw err;
  }
};

module.exports = {
  textToSpeech,
};
