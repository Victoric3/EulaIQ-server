// const dotenv = require("dotenv")
// dotenv.config({ path: './config.env' })
// const express = require("express")
// const { textChunkQueue } = require("./Helpers/Libraries/redis");
// const {
//   processAudioFiles,
//   processTextChunks,
// } = require("./Helpers/Libraries/azureOpenai");
// const { extractAndParseJSON } = require("./Helpers/input/escapeStrinedJson");
// // const Redis = require("ioredis");
// const connectDatabase = require("./Helpers/database/connectDatabase")
// connectDatabase()


// // Initialize Redis client for status updates
// // const redis = new Redis({
// //   host: process.env.REDIS_HOST,
// //   port: process.env.REDIS_PORT,
// //   password: process.env.REDIS_PASSWORD,
// //   tls: {},
// // });

// // Function to update status in Redis
// // const updateStatus = async (jobId, status) => {
// //   await redis.hset(`job:${jobId}`, "status", status);
// // };

// textChunkQueue.process(async (job) => {
//   const {
//     textChunks,
//     module,
//     moduleDescription,
//     collection,
//     index,
//     voiceActors
//   } = job.data;

//   const jobId = job.id; // Unique identifier for the job

//   try {
//     console.log(`Started processing chunk ${index} for job ${jobId}`);
//     // await updateStatus(jobId, `Processing chunk ${index}`);
//     const result = await processTextChunks(
//       textChunks[index - 1],
//       textChunks[index],
//       module,
//       moduleDescription,
//       voiceActors
//     );

//     const cleanedResultData = extractAndParseJSON(result);
//     // console.log(
//     //   `cleanedResultData for chunk ${index} for job ${jobId}:`,
//     //   cleanedResultData
//     // );
//     await processAudioFiles(cleanedResultData, collection, index, module, voiceActors);

//     console.log(`Finished processing chunk ${index} for job ${jobId}`);
//     // await updateStatus(jobId, `Finished processing chunk ${index}`);
//   } catch (error) {
//     console.error(
//       `Error processing chunk ${index} for job ${jobId}:`,
//       error.message
//     );
//     // await updateStatus(
//     //   jobId,
//     //   `Error processing chunk ${index}: ${error.message}`
//     // );
//     throw error;
//   }
// });

// console.log("Worker is up and running.");
