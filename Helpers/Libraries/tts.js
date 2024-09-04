const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { BlobServiceClient } = require("@azure/storage-blob");
const { Buffer } = require("buffer");
const { PassThrough } = require("stream");
const fs = require("fs");
const Audio = require("../../Models/Audio");
const AudioCollection = require("../../Models/AudioCollection");

const uploadBlobFromLocalPath = async (
  containerClient,
  blobName,
  localFilePath
) => {
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadFile(localFilePath);
};

const calculateDuration = async (filePath) => {
  const mm = await import("music-metadata");
  const metadata = await mm.parseFile(filePath);
  return metadata.format.duration;
};

const textToSpeech = async (
  key,
  region,
  ssml,
  title,
  filename,
  collection,
  index,
  voice
) => {
  try {
    const audioCollection = await AudioCollection.findById(collection._id);

    return new Promise((resolve, reject) => {
      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
      speechConfig.speechSynthesisOutputFormat =
        sdk.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3;

      const audioConfig = filename
        ? sdk.AudioConfig.fromAudioFileOutput(filename)
        : null;
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

      console.log("ssml: ", ssml);
      synthesizer.speakSsmlAsync(
        ssml,
        async (result) => {
          synthesizer.close();

          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            console.log("synthesis finished.");
            const { audioData } = result;

            if (filename) {
              fs.writeFileSync(filename, Buffer.from(audioData));

              try {
                const timestamp = new Date()
                  .toISOString()
                  .replace(/[:.]/g, "-");
                const blobName = `${title}-${timestamp}.mp3`;
                const encodedBlobName = encodeURIComponent(blobName);
                const blobServiceClient =
                  BlobServiceClient.fromConnectionString(
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
                  title: `${(index + 1).toString().padStart(2, "0")}-${
                    collection.title.length < 30
                      ? collection.title
                      : collection.title.slice(0, 30) + ".."
                  }`,
                  text: ssml,
                  audioUrl,
                  audioCollection: collection._id,
                  index,
                  audioDuration: duration,
                  voice,
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
                console.log(audioCollection);

                // fs.unlinkSync(filename);

                resolve({ audioUrl, audioCollection });
              } catch (uploadError) {
                reject(uploadError);
              }
            } else {
              const bufferStream = new PassThrough();
              bufferStream.end(Buffer.from(audioData));
              resolve(bufferStream);
            }
          } else {
            reject(
              new Error(`Speech synthesis failed: ${result.errorDetails}`)
            );
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
