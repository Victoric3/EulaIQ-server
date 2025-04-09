const { queryCreator, mcqQuestionStructure } = require("../../data/audioModules");
const { textToSpeech } = require("./tts");
const { generateSSML } = require("./ssmlTemplate");
const { extractAndParseJSON } = require("../input/escapeStrinedJson");
const axios = require('axios');
const fsPromises = require('fs').promises;
const path = require('path');
const { AzureOpenAI } = require("openai");
const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');
const Audio = require('../../Models/Audio');
const { concatenateWavFiles } = require("./audioHelpers")
const { getSystemPrompt, getAudioGenerationPrompt, getUserPrompt } = require("../query/queryMapping");
/**
 * Core Azure OpenAI API call with enhanced error handling and image support
 * @param {string} query - The content to send to the model
 * @param {string} systemInstruction - System prompt for the model
 * @param {string} deployment - The model deployment name (e.g., 'gpt-4o')
 * @param {Array} imagePaths - Optional image paths for vision models
 * @returns {Promise<string>} - The model's response text
 */
async function azureOpenai(query, systemInstruction, deployment, imagePaths = []) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_APIKEY;
  const apiVersion = "2024-05-01-preview";

  // 1. Process images to base64
  const imageContents = await Promise.all(
    imagePaths.map(async (path) => {
      try {
        const data = await fsPromises.readFile(path);
        const mimeType = getMimeType(path);
        return {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${data.toString('base64')}`
          }
        };
      } catch (err) {
        console.error(`Failed to process image ${path}:`, err);
        // Return a placeholder instead of failing the whole request
        return {
          type: "text",
          text: `[Image processing failed for: ${path}]`
        };
      }
    })
  );

  // 2. Construct message payload in AI Studio format
  const messages = [
    {
      role: "system",
      content: [{
        type: "text",
        text: systemInstruction
      }]
    },
    {
      role: "user",
      content: [
        { type: "text", text: query },
        ...imageContents
      ]
    }
  ];

  // 3. Make API call with better error handling
  try {
    const response = await axios.post(
      `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
      {
        messages,
        temperature: 0.3,
        top_p: 0.95,
        max_tokens: 4000
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey
        },
        timeout: 120000 // 2 minute timeout
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    // Enhanced error reporting
    if (error.response) {
      console.error("Azure OpenAI API Error:", {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers
      });

      // Create more user-friendly error message
      let errorMessage = `Azure OpenAI API error (${error.response.status})`;
      if (error.response.data?.error?.message) {
        errorMessage += `: ${error.response.data.error.message}`;
      }

      const enhancedError = new Error(errorMessage);
      enhancedError.status = error.response.status;
      enhancedError.responseData = error.response.data;
      throw enhancedError;
    }

    // Handle network errors
    console.error("Network Error:", error.message);
    throw new Error(`Azure OpenAI request failed: ${error.message}`);
  }
}

// Helper function for MIME type detection
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}

/**
 * Process content (text or sections) through Azure OpenAI
 * @param {string|Object} previousContent - Previous content for context
 * @param {string|Array} content - Current content to process
 * @param {string} module - Processing module type
 * @param {string} moduleDescription - Description of processing
 * @param {Array} voiceActors - For audio: voice options
 * @param {boolean} isLastPart - Whether this is the final part
 * @param {string} type - Processing type (audio, question)
 * @param {string} systemInstruction - Instructions for the model
 * @returns {Promise<Object>} Processed content
 */
async function processTextChunks(
  previousContent,
  content,
  module,
  moduleDescription,
  voiceActors,
  isLastPart,
  type,
  systemInstruction
) {
  // Improved retry mechanism
  let attempts = 0;
  const maxRetries = 3;
  const backoffFactor = 2; // Exponential backoff

  // Prepare content from different sources (text or ebook sections)
  const preparedContent = prepareContentForProcessing(content);

  if (preparedContent.length < 20) {
    console.log("Content too short, returning empty result");
    return type === "audio"
      ? { textChunks: [] }
      : { questions: [] };
  }

  // Define async function for core processing with retries
  async function attemptProcessing() {
    try {
      // Build query based on content and type
      const query = buildQuery(
        previousContent,
        preparedContent,
        module,
        moduleDescription,
        voiceActors,
        isLastPart,
        type
      );

      // Call Azure OpenAI
      const result = await azureOpenai(query, systemInstruction, "gpt-4o");

      // Parse the JSON result
      const parsedResult = extractAndParseJSON(result);
      return parsedResult;
    } catch (error) {
      attempts++;

      // Calculate backoff delay (500ms, 1000ms, 2000ms, etc.)
      const delay = 500 * Math.pow(backoffFactor, attempts - 1);

      console.warn(`Attempt ${attempts} failed: ${error.message}. Retrying in ${delay}ms...`);

      if (attempts >= maxRetries) {
        console.error("Max retries reached, failing");
        throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
      }

      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      return await attemptProcessing(); // Recursive retry
    }
  }

  // Start the processing with retries
  return await attemptProcessing();
}

//  Prepare content for processing from various sources
function prepareContentForProcessing(content) {
  // If content is an array of sections, extract and format
  if (Array.isArray(content) && content.length > 0 && typeof content[0] === 'object') {
    return content.map(section => {
      // Clean HTML content
      const cleanContent = section.content.replace(/<[^>]+>/g, ' ');
      return `## ${section.title || 'Untitled Section'}\n\n${cleanContent}`;
    }).join('\n\n');
  }

  // Simple text content
  return typeof content === 'string' ? content : JSON.stringify(content);
}

//  * Build the appropriate query based on content type and processing module
function buildQuery(previousContent, content, module, moduleDescription, voiceActors, isLastPart, type, reference="") {
  if (type === "question") {
    return `{
      "task": create ${module} questions,
      "description": Generate json data: ${moduleDescription}, the json data should have the following structure ${mcqQuestionStructure(reference)},
      "previousContent": ${previousContent},
      "currentContent": ${content},
    }`;
  } else if (type === "audio") {
    return queryCreator(
      previousContent,
      content,
      module,
      moduleDescription,
      voiceActors,
      isLastPart,
      type
    );
  }

  // Default case
  return {
    task: `process ${module} content`,
    description: moduleDescription || `Process content as ${module}`,
    previousContent: previousContent,
    currentContent: content,
    isLastPart: isLastPart
  };
}

// Process audio files based on processed content
async function processAudioFiles(
  cleanedResultData,
  collection,
  index,
  module,
  voiceActors
) {
  let attempts = 0;
  const maxRetries = 3;

  async function attemptAudioProcessing() {
    try {
      const outputFile = `${(index + 1).toString().padStart(2, "0")}-${collection.title.length < 30
        ? collection.title
        : collection.title.slice(0, 30)
        }.mp3`;

      const textChunks = cleanedResultData?.textChunks
        ? cleanedResultData.textChunks
        : cleanedResultData.textChunk;

      if (!textChunks || textChunks.length === 0) {
        console.warn("No text chunks to process for audio");
        return { audioCollection: collection };
      }

      const ssml = generateSSML(textChunks, module);

      const voice = voiceActors.length > 1
        ? voiceActors.join(", ")
        : voiceActors[0] || "en-US-NovaMultilingualNeural";

      const audioResult = await textToSpeech(
        process.env.AZURE_SPEECH_API_KEY,
        "northcentralus",
        ssml,
        collection.title,
        outputFile,
        collection,
        index,
        voice
      );

      return audioResult;
    } catch (error) {
      attempts++;

      if (attempts >= maxRetries) {
        console.error(`Failed to process audio after ${maxRetries} attempts:`, error);
        throw error;
      }

      const delay = 1000 * attempts;
      console.warn(`Audio processing attempt ${attempts} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));

      return await attemptAudioProcessing();
    }
  }

  return await attemptAudioProcessing();
}

/**
 * Process audio using GPT-4o-audio-preview with multi-speaker support
 * @param {Object} content - The text content to convert to audio
 * @param {Object} collection - The audio collection object
 * @param {Number} index - The index of the section
 * @param {String} module - The processing module type
 * @param {String} moduleDescription - Description of the module purpose
 * @param {Array} voiceActors - Array of voice options for different speakers
 * @returns {Promise<Object>} The result of the audio processing
 */
async function processGptAudioFiles(
  content,
  collection,
  index,
  module,
  moduleDescription = "",
  voiceActors = []
) {
  let attempts = 0;
  const maxRetries = 3;

  async function attemptAudioProcessing() {
    try {
      // Create a unique filename base for the audio
      const fileBase = `${(index + 1).toString().padStart(2, "0")}-${collection.title.length < 30
        ? collection.title
        : collection.title.slice(0, 30)
        }-${uuidv4().substring(0, 8)}`;

      // Prepare section title and type data
      const sectionTitle = content.title || `Section ${index + 1}`;
      const sectionType = content.type || "head";
      const isSubsection = sectionType === "sub";
      const parentTitle = content.parentTitle || "";

      // Extract text content
      let textContent;
      if (Array.isArray(content.textChunks) && content.textChunks.length > 0) {
        textContent = content.textChunks
          .map(chunk => (typeof chunk === "object" ? chunk.text : chunk))
          .join("\n\n");
      } else if (content.content) {
        textContent = content.content;
      } else {
        textContent = JSON.stringify(content);
      }

      if (!textContent || textContent.length < 10) {
        console.warn("Text content too short for audio generation");
        return { audioCollection: collection };
      }

      // Validate and normalize voice actors
      const availableVoices = [
        "alloy", "ash", "ballad", "coral", "echo",
        "fable", "onyx", "nova", "sage", "shimmer"
      ];

      const validVoiceActors = voiceActors.filter(voice =>
        availableVoices.includes(voice.toLowerCase())
      );

      if (validVoiceActors.length === 0) {
        validVoiceActors.push("alloy"); // Default voice
      }

      console.log(`Using voices: ${validVoiceActors.join(", ")}`);

      // --- STEP 1: Transform content using GPT-4o with type-specific instructions ---
      console.log(`Transforming content for audio generation: ${sectionTitle} (${sectionType})`);
      let systemPrompt = getSystemPrompt();

      // Add specific guidance for subsections to create proper transitions
      if (isSubsection) {
        systemPrompt += `\n\n### IMPORTANT: SUBSECTION HANDLING
        This is a subsection titled "${sectionTitle}" that belongs to the main section "${parentTitle}".
        
        **Required Elements for Subsections:**
        1. **Smooth Transition**: Begin with a natural transition from the main section, such as:
           - "Now that we've covered ${parentTitle}, let's explore ${sectionTitle}"
           - "Looking deeper into ${parentTitle}, we find ${sectionTitle}"
           - Other natural transitions that sound conversational, not scripted
        
        2. **Context Maintenance**: Briefly reference the main topic to maintain continuity
        
        3. **Signposting**: Use clear signposts to help listeners understand the structure
           - Example: "Next up in our exploration of ${parentTitle}, we'll examine ${sectionTitle}"
           - Example: "This brings us to an important aspect of ${parentTitle}: ${sectionTitle}"
        
        4. **Closure**: At the end, provide a brief transition back to the broader topic
           ${content.isLast ? 'As this is the final subsection, include a summary closing the entire topic.' : 'Prepare listeners for the next subsection that will follow.'}`;
      } else if (content.hasSubsections) {
        // For head sections with subsections, prepare listeners for the structure
        systemPrompt += `\n\n### IMPORTANT: MAIN SECTION WITH SUBSECTIONS
        This is a main section that has subsections following it. End your audio by:
        
        1. Providing a brief overview of what you've covered
        2. Indicating that you'll explore specific aspects in more detail
        3. Creating a natural handoff to the subsections that will follow
        
        Example: "So that's an overview of ${sectionTitle}. Next, we'll dig deeper into specific aspects..."`;
      }

      // Build the query with type-specific information
      const query = getUserPrompt(module, sectionType, textContent, parentTitle, isSubsection, validVoiceActors, moduleDescription);

      // Transform content using GPT-4o
      const transformationResult = await azureOpenai(query, systemPrompt, "gpt-4o");
      const transformedContent = extractAndParseJSON(transformationResult);

      if (!transformedContent || !transformedContent.segments || transformedContent.segments.length === 0) {
        console.warn("Failed to transform content into audio script");
        throw new Error("Content transformation failed");
      }

      console.log(`Successfully transformed content into ${transformedContent.segments.length} segments`);

      // --- STEP 2: Generate audio for each segment ---
      console.log(`Generating audio for transformed content: ${sectionTitle}`);
      const audioEndpoint = process.env.AZURE_OPENAI_ENDPOINT_AUDIO_MINI;
      const audioApiKey = process.env.AZURE_OPENAI_APIKEY_AUDIO_MINI;
      const audioApiVersion = "2025-01-01-preview";

      const audioClient = new AzureOpenAI({
        apiKey: audioApiKey,
        endpoint: audioEndpoint,
        apiVersion: audioApiVersion,
        defaultDeployment: "gpt-4o-mini-audio-preview",
      });

      const tempDir = path.join(__dirname, "../../temp");
      await fsPromises.mkdir(tempDir, { recursive: true });

      const segmentFiles = [];
      const segmentDetails = [];

      for (let i = 0; i < transformedContent.segments.length; i++) {
        const segment = transformedContent.segments[i];
        const segmentVoice = segment.voice.toLowerCase();
        const segmentText = segment.text;
        const instructions = segment.instructions || "Speak in a natural, educational tone.";

        if (!segmentText || segmentText.trim().length < 5) {
          console.warn(`Skipping empty segment ${i + 1}`);
          continue;
        }

        const voice = availableVoices.includes(segmentVoice) ? segmentVoice : validVoiceActors[0];
        console.log(`Generating audio for segment ${i + 1} using voice: ${voice}`);
        console.log("content", `${instructions}: '${segmentText}'`,);

        const audioSystemPrompt = getAudioGenerationPrompt();

        const audioResult = await audioClient.chat.completions.create({
          model: "gpt-4o-mini-audio-preview",
          messages: [
            {
              role: "system",
              content: audioSystemPrompt,
            },
            {
              role: "user",
              content: `${instructions}: '${segmentText}'`,
            },
          ],
          modalities: ["text", "audio"],
          audio: {
            voice: voice,
            format: "wav",
          },
        });

        if (audioResult.choices && audioResult.choices[0]?.message?.audio?.data) {
          const audioData = audioResult.choices[0].message.audio.data;
          const segmentFileName = `${fileBase}-segment-${i + 1}-${voice}.wav`;
          const segmentFilePath = path.join(tempDir, segmentFileName);

          const audioBuffer = Buffer.from(audioData, "base64");
          await fsPromises.writeFile(segmentFilePath, audioBuffer);

          const audioDuration = Math.ceil(segmentText.length / 15);
          segmentFiles.push(segmentFilePath);
          segmentDetails.push({
            voice: voice,
            duration: audioDuration,
            text: segmentText.substring(0, 100) + (segmentText.length > 100 ? "..." : ""),
          });
          console.log(`Generated audio for segment ${i + 1}: ${segmentFilePath}`);
        } else {
          console.warn(`No audio data for segment ${i + 1}`);
        }
      }

      if (segmentFiles.length === 0) {
        throw new Error("Failed to generate any audio segments");
      }

      // --- STEP 3: Concatenate audio segments into a single file ---
      const combinedFileName = `${fileBase}-combined.wav`;
      const combinedFilePath = path.join(tempDir, combinedFileName);

      await concatenateWavFiles(segmentFiles, combinedFilePath);

      console.log(`Concatenated audio segments into: ${combinedFilePath}`);

      // Upload the combined audio to Azure Blob Storage
      const audioUrl = await uploadAudioToAzure(combinedFilePath, combinedFileName);

      // Calculate total duration
      const totalDuration = segmentDetails.reduce((sum, segment) => sum + segment.duration, 0);

      // Create a new Audio document with the single combined audio
      const newAudio = new Audio({
        title: transformedContent.title || sectionTitle,
        description: transformedContent.description || `Generated audio for ${sectionTitle}`,
        audioUrl: audioUrl,
        audioDuration: totalDuration,
        audioCollection: collection._id,
        index: index,
        segments: segmentDetails,
        type: sectionType // Store the section type
      });

      await newAudio.save();

      // Add this audio to the collection
      await collection.updateOne({
        $push: { audios: newAudio },
      });

      // Clean up all temp files
      // for (const file of [...segmentFiles, combinedFilePath]) {
      //   try {
      //     await fsPromises.unlink(file);
      //   } catch (cleanupError) {
      //     console.warn(`Failed to clean up temp file ${file}:`, cleanupError);
      //   }
      // }

      return {
        audioCollection: collection,
        audioUrl: audioUrl,
        audioDuration: totalDuration,
        segmentCount: segmentDetails.length,
        type: sectionType
      };
    } catch (error) {
      attempts++;
      console.error(`Audio processing attempt ${attempts} failed:`, error);
      if (attempts >= maxRetries) {
        console.error(`Failed to process audio after ${maxRetries} attempts`);
        throw error;
      }
      const delay = 1000 * attempts;
      console.warn(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return await attemptAudioProcessing();
    }
  }

  return await attemptAudioProcessing();
}

/**
 * Upload an audio file to Azure Blob Storage
 * @param {string} filePath - Path to the local file
 * @param {string} fileName - Name for the file in storage
 * @returns {Promise<string>} - The URL of the uploaded file
 */
async function uploadAudioToAzure(filePath, fileName) {
  try {
    // Get connection string from environment variables
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.CONTAINER_AUDIO_NAME;

    if (!connectionString || !containerName) {
      throw new Error('Azure Storage credentials not configured properly');
    }

    // Create BlobServiceClient using the connection string
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

    // Get container client
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Create container if it doesn't exist
    await containerClient.createIfNotExists({
      access: 'blob'
    });

    // Generate unique blob name
    const blobName = `${uuidv4()}-${fileName}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload file
    const fileBuffer = await fsPromises.readFile(filePath);
    const uploadOptions = {
      blobHTTPHeaders: {
        blobContentType: 'audio/mpeg'
      }
    };

    await blockBlobClient.uploadData(fileBuffer, uploadOptions);

    // Get blob URL
    return blockBlobClient.url;
  } catch (error) {
    console.error('Error uploading audio to Azure:', error);
    throw new Error(`Failed to upload audio: ${error.message}`);
  }
}

// Export the new function
module.exports = {
  azureOpenai,
  processTextChunks,
  processAudioFiles,
  processGptAudioFiles,
  prepareContentForProcessing
};
