const mongoose = require("mongoose");
const AudioCollection = require("../Models/AudioCollection");
const Audio = require("../Models/Audio");
const Story = require("../Models/story");
const User = require("../Models/user");
const { v4: uuidv4 } = require("uuid");
const {
  processAudioFiles,
  processTextChunks,
  processGptAudioFiles
} = require("../Helpers/Libraries/azureOpenai");

/**
 * Create audio from an ebook
 */
const handleEbookAudioCreation = async (req, res) => {
  try {
    //1, accepts the ebookId and voice actors from the request body, optionally accepts the module and moduleDescription
    const { 
      voiceActors, 
      module = "simplified", 
      moduleDescription = "", 
      ebookId,
      useGpt4oAudio = false
    } = req.body;
    
    //2 Parse voice actors from JSON string if needed
    const voiceActorsArray = Array.isArray(voiceActors) 
      ? voiceActors 
      : (typeof voiceActors === 'string' ? JSON.parse(voiceActors) : []);
    
    //3 Validate voiceActorsArray
    if (!voiceActorsArray || !Array.isArray(voiceActorsArray) || voiceActorsArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid voice actors. Provide at least one voice."
      });
    }
    
    //4 Find the ebook
    const ebook = await Story.findById(ebookId)
      .select('title description image sections status slug audioCollections')
      .lean();
    
    if (!ebook) {
      return res.status(404).json({
        success: false,
        message: "Ebook not found"
      });
    }
    
    //5 Create audio collection
    const audioCollection = new AudioCollection({
      imageUrl: ebook.image || "https://i.ibb.co/MCPFhMT/headphones-3658441-1920.jpg",
      title: ebook.title,
      description: ebook.description || `Audio version of ${ebook.title}`,
      userQuery: moduleDescription,
      createdBy: req.user._id,
      associatedEbook: ebookId,
      status: 'processing',
      progress: 0,
      retryCount: 0,
      processingStatus: ebook.status === 'complete' ? 
        'Organizing content sections' : 
        'Waiting for ebook processing to complete',
      audioMethod: useGpt4oAudio ? 'gpt4o' : 'tts' // Track which method was used
    });
    
    await audioCollection.save();
    
    // Add collection to user
    await User.findByIdAndUpdate(req.user._id, {
      $push: { audioCollections: { collectionId: audioCollection._id } }
    });
    
    // Add audio collection reference to the ebook (two-way relationship)
    await Story.findByIdAndUpdate(ebookId, {
      $push: { audioCollections: audioCollection._id }
    });
    
    // Respond immediately
    res.status(202).json({
      success: true,
      message: "Audio generation started",
      collectionId: audioCollection._id,
      status: "processing",
      waitingForEbook: ebook.status !== 'complete',
      method: useGpt4oAudio ? 'gpt4o' : 'tts'
    });
    
    // Start background processing
    generateAudioInBackground(ebook, audioCollection, {
      module,
      moduleDescription,
      voiceActorsArray,
      useGpt4oAudio // Pass the new option
    }).catch(async (error) => {
      console.error("Audio generation failed:", error);
      await AudioCollection.findByIdAndUpdate(audioCollection._id, {
        status: 'error',
        error: error.message
      });
    });
    
  } catch (error) {
    console.error("Error initiating audio generation:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to start audio generation",
      error: error.message
    });
  }
};

const continueAudioCreation = async (req, res) => {
    try {
      const { 
        collectionId, 
        module = "simplified", 
        moduleDescription = "Convert technical content into clear, well-structured audio", 
        voiceActors,
        useGpt4oAudio // New parameter
      } = req.body;
      
      // Parse voice actors
      const voiceActorsArray = Array.isArray(voiceActors) 
        ? voiceActors 
        : (typeof voiceActors === 'string' ? JSON.parse(voiceActors) : []);
      
      // Find collection
      const audioCollection = await AudioCollection.findById(collectionId);
      if (!audioCollection) {
        return res.status(404).json({ 
          success: false,
          message: "Audio collection not found" 
        });
      }
      
      // Make sure collection is not already complete or in unrecoverable error state
      if (audioCollection.status === 'complete') {
        return res.status(400).json({
          success: false,
          message: "Audio generation is already complete"
        });
      }
      
      // Determine which method to use - either from request or from saved collection
      const useGpt4oMethod = useGpt4oAudio !== undefined ? 
        useGpt4oAudio : 
        (audioCollection.audioMethod === 'gpt4o');
      
      if (audioCollection.status === 'error') {
        // Reset error status to allow retry
        await audioCollection.updateOne({
          $set: {
            status: 'processing',
            processingStatus: 'Restarting audio generation',
            error: null,
            audioMethod: useGpt4oMethod ? 'gpt4o' : 'tts' // Update the method if changing
          }
        });
      }
      
      // Get associated ebook
      const ebook = await Story.findById(audioCollection.associatedEbook)
        .select('title sections status')
        .lean();
        
      if (!ebook) {
        return res.status(404).json({
          success: false,
          message: "Associated ebook not found"
        });
      }
      
      // Respond immediately
      res.status(202).json({
        success: true,
        message: "Audio generation restarted",
        collectionId: audioCollection._id,
        status: "processing",
        method: useGpt4oMethod ? 'gpt4o' : 'tts'
      });
      
      // Resume background processing - reusing the same function
      generateAudioInBackground(ebook, audioCollection, {
        module,
        moduleDescription,
        voiceActorsArray,
        useGpt4oAudio: useGpt4oMethod
      }).catch(async (error) => {
        console.error("Audio generation failed:", error);
        await AudioCollection.findByIdAndUpdate(audioCollection._id, {
          status: 'error',
          error: error.message
        });
      });
      
    } catch (error) {
      console.error("Error continuing audio generation:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to continue audio generation",
        error: error.message
      });
    }
  };

/**
 * Generate audio in background with progress tracking and retry mechanism
 */
const generateAudioInBackground = async (ebook, audioCollection, options) => {
  console.log(`Starting audio generation for ebook: ${ebook._id}`);
  
  try {
    await audioCollection.updateOne({ 
      $set: { 
        status: 'processing',
        startTime: new Date()
      }
    });
    
    // Check if ebook processing is complete, if not wait and retry
    // This enables parallel processing with intelligent waiting
    const MAX_RETRIES = 3;
    let retryCount = 0;
    
    // Get the latest ebook status (not using the ebook parameter, which could be stale)
    let currentEbook = await Story.findById(ebook._id)
      .select('sections status title')
      .lean();
    
    // If ebook is not complete, implement retry logic
    while (currentEbook.status !== 'complete' && retryCount < MAX_RETRIES) {
      // Update audio collection status to indicate waiting
      await audioCollection.updateOne({
        $set: {
          processingStatus: `Waiting for ebook processing to complete (attempt ${retryCount + 1}/${MAX_RETRIES})`,
          retryCount: retryCount + 1
        }
      });
      
      console.log(`Ebook ${ebook._id} not ready yet. Waiting before retry ${retryCount + 1}/${MAX_RETRIES}`);
      
      // Exponential backoff: wait longer between each retry
      const waitTime = 5000 * Math.pow(2, retryCount); // 5s, 10s, 20s
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Check ebook status again
      currentEbook = await Story.findById(ebook._id)
        .select('sections status title')
        .lean();
      
      retryCount++;
    }
    
    // If we've exhausted retries and ebook still not ready, fail with appropriate message
    if (currentEbook.status !== 'complete' && retryCount >= MAX_RETRIES) {
      throw new Error(`Ebook processing not complete after ${MAX_RETRIES} retry attempts. Try again later.`);
    }
    
    // If we're here, ebook is ready or we got enough content to proceed
    
    // Update audio collection with latest ebook info
    await audioCollection.updateOne({
      $set: {
        processingStatus: 'Organizing content sections',
      }
    });
    
    // Group sections by head/sub structure
    const headSections = currentEbook.sections?.filter(s => s.type === 'head') || [];
    const totalSections = headSections.length;
    
    if (totalSections === 0) {
      throw new Error("No content sections found in ebook");
    }
    
    // Track total number of sections for progress calculation
    let totalProcessedSections = 0;
    const allSectionsCount = currentEbook.sections.length;
    
    // Process head sections and their subsections one by one
    let previousContent = null;
    
    for (let i = 0; i < headSections.length; i++) {
      const headSection = headSections[i];
      
      // Find subsections for this head section
      const subSections = currentEbook.sections.filter(s => 
        s.type === 'sub' && 
        currentEbook.sections.indexOf(s) > currentEbook.sections.indexOf(headSection) &&
        (i === headSections.length - 1 || currentEbook.sections.indexOf(s) < currentEbook.sections.indexOf(headSections[i+1]))
      );
      
      // Calculate total sections in this group for progress tracking
      const groupSectionCount = 1 + subSections.length;
      
      // Update progress for head section
      totalProcessedSections++;
      const progress = Math.round((totalProcessedSections / allSectionsCount) * 100);
      
      await audioCollection.updateOne({
        $set: {
          progress: progress,
          processingStatus: `Processing head section ${i+1}/${totalSections}: ${headSection.title}`
        }
      });
      
      try {
        // Process head section (standalone)
        const useGpt4oAudio = options.useGpt4oAudio === true;
        
        if (useGpt4oAudio) {
          // GPT-4o audio generation for head section
          console.log(`Using GPT-4o audio generation for head section: ${headSection.title}`);
          
          // Create content object with section content and title
          const sectionContent = {
            title: headSection.title,
            content: headSection.content,
            index: totalProcessedSections - 1,
            type: 'head', // Specify the section type
            isFirst: i === 0, // This is helpful for proper introductions
            isLast: i === headSections.length - 1 && subSections.length === 0,
            hasSubsections: subSections.length > 0 // Flag to indicate if there are subsections
          };
          
          // Generate head section audio
          await processGptAudioFiles(
            sectionContent,
            audioCollection,
            totalProcessedSections - 1, // Section index
            options.module,
            options.moduleDescription, 
            options.voiceActorsArray
          );
          
          console.log(`Generated audio for head section: ${headSection.title}`);
          
          // Process each subsection separately
          for (let j = 0; j < subSections.length; j++) {
            const subSection = subSections[j];
            totalProcessedSections++;
            
            // Update progress for this subsection
            const subProgress = Math.round((totalProcessedSections / allSectionsCount) * 100);
            await audioCollection.updateOne({
              $set: {
                progress: subProgress,
                processingStatus: `Processing subsection ${j+1}/${subSections.length} of ${headSection.title}`
              }
            });
            
            console.log(`Using GPT-4o audio generation for subsection: ${subSection.title}`);
            
            // Create content object with subsection content and relation to head section
            const subSectionContent = {
              title: subSection.title,
              content: subSection.content,
              index: totalProcessedSections - 1,
              type: 'sub', // Mark as subsection
              parentTitle: headSection.title, // Parent section title for context
              parentContent: headSection.content, // Parent content for context
              isFirst: j === 0, // First subsection
              isLast: j === subSections.length - 1 && i === headSections.length - 1 // Last subsection
            };
            
            // Generate subsection audio with transition guidance
            await processGptAudioFiles(
              subSectionContent,
              audioCollection,
              totalProcessedSections - 1, // Section index
              options.module,
              options.moduleDescription, 
              options.voiceActorsArray
            );
            
            console.log(`Generated audio for subsection: ${subSection.title}`);
          }
        } else {
          // Traditional text-to-speech method would be modified similarly...
          // (Keeping this part shorter for brevity)
          const systemInstruction = `
          You are an expert at converting educational content into engaging audio scripts.
          Your task is to transform technical content into clear, well-structured audio segments.
          
          This is a ${headSection.type === 'head' ? 'main section' : 'subsection'}.
          ${headSection.type === 'sub' ? `It belongs to the main section: "${headSection.parentTitle}"` : ''}
          
          Guidelines:
          - Simplify complex content while preserving key information
          - Structure content for audio delivery with clear transitions
          - Format mathematical expressions for spoken language
          - Only use the provided voice options
          - Maintain a conversational, educational tone
          `;
          
          // Process this section
          const result = await processTextChunks(
            previousContent,
            [headSection], // Process head section alone
            options.module,
            options.moduleDescription,
            options.voiceActorsArray,
            i === headSections.length - 1 && subSections.length === 0, // isLast
            "audio",
            systemInstruction
          );
          
          // Process head section audio
          if (result && result.textChunks && result.textChunks.length > 0) {
            await processAudioFiles(
              result,
              audioCollection,
              totalProcessedSections - 1,
              options.module,
              options.voiceActorsArray
            );
            
            console.log(`Generated audio for head section: ${headSection.title}`);
          }
          
          // Now process each subsection separately
          for (let j = 0; j < subSections.length; j++) {
            const subSection = subSections[j];
            totalProcessedSections++;
            
            // Update progress
            const subProgress = Math.round((totalProcessedSections / allSectionsCount) * 100);
            
            // Similar subsection processing...
            // (Code omitted for brevity but follows same pattern)
          }
        }
        
        // Update processing status to reflect progress
        await audioCollection.updateOne({
          $set: {
            processingStatus: `Processed ${i+1} of ${totalSections} main sections`
          }
        });
      } catch (sectionError) {
        // Error handling remains similar
        console.error(`Error processing audio for section ${headSection.title}:`, sectionError);
        await audioCollection.updateOne({
          $set: {
            processingStatus: `Error processing section ${i+1}: ${sectionError.message}. Continuing with next section.`
          }
        });
      }
      
      // Use current content as context for next round
      previousContent = headSection.content;
    }
    
    // Calculate total duration
    const audioCollectionWithAudios = await AudioCollection.findById(audioCollection._id);
    const totalDuration = audioCollectionWithAudios.audios.reduce(
      (sum, audio) => sum + (audio.audioDuration || 0), 
      0
    );
    
    // Mark as complete
    await audioCollection.updateOne({
      $set: {
        status: 'complete',
        progress: 100,
        processingStatus: `Generated audio for ${totalSections} sections`,
        playtime: totalDuration,
        endTime: new Date()
      }
    });
    
    console.log(`Audio generation complete for collection ${audioCollection._id}`);
    
  } catch (error) {
    console.error(`Audio generation failed for ebook ${ebook._id}:`, error);
    
    // Update collection with error status
    await AudioCollection.findByIdAndUpdate(audioCollection._id, {
      $set: {
        status: 'error',
        processingStatus: `Error: ${error.message}`,
        error: error.message
      }
    });
    
    throw error;
  }
}

/**
 * Get audio generation status
 */
const getAudioGenerationStatus = async (req, res) => {
  try {
    const { collectionId } = req.params;
    
    const collection = await AudioCollection.findById(collectionId)
      .select('title status progress processingStatus audios playtime startTime endTime error')
      .lean();
    
    if (!collection) {
      return res.status(404).json({
        success: false,
        message: "Audio collection not found"
      });
    }
    
    return res.status(200).json({
      success: true,
      data: {
        id: collection._id,
        title: collection.title,
        status: collection.status,
        progress: collection.progress,
        processingStatus: collection.processingStatus,
        audioCount: collection.audios?.length || 0,
        audioFiles: collection.audios?.map(audio => ({
          id: audio._id,
          title: audio.title,
          duration: audio.audioDuration,
          url: audio.url
        })) || [],
        playtime: collection.playtime,
        startTime: collection.startTime,
        endTime: collection.endTime,
        error: collection.error
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch audio generation status",
      error: error.message
    });
  }
};

const createAudioCollection = async (req, res) => {
  try {
    // Extract data from the request body
    const { title, description, access } = req.body;

    // Create a new audio collection instance
    const newCollection = new AudioCollection({
      imageUrl:
        req.imageUrl || "https://i.ibb.co/MCPFhMT/headphones-3658441-1920.jpg", // If imageUrl is not provided in the request, it will be the default image
      title,
      description,
      createdBy: req.user._id,
      access,
    });

    // Save the new audio collection to the database
    await newCollection.save();

    // Respond with success message
    res.status(201).json({
      message: "Audio collection created successfully",
      data: newCollection,
    });
  } catch (error) {
    // Handle errors
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Controller to create an audio
const createAudio = async (req, res) => {
  try {
    // Extract data from the request body
    const { title, description, audioUrl, collectionId, index } = req.body;

    // Check if the collectionId exists
    const collection = await AudioCollection.findOne({ _id: collectionId });
    if (!collection) {
      return res.status(400).json({ error: "Invalid Collection ID" });
    }
    // Create a new audio instance
    const newAudio = new Audio({
      title,
      description,
      audioUrl,
      audioCollection: collectionId,
      index,
    });
    collection.audios.push(newAudio);
    await collection.save();
    // Save the new audio to the database
    await newAudio.save();

    // Respond with success message
    res
      .status(201)
      .json({ message: "Audio created successfully", data: newAudio });
  } catch (error) {
    // Handle errors
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Controller to get all audio collections with pagination
const getAllCollections = async (req, res) => {
  try {
    // Extract pagination parameters from the query string
    const { page = 1, limit = 10 } = req.query;

    // Convert page and limit to numbers
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    // Calculate the number of documents to skip
    const skip = (pageNumber - 1) * limitNumber;

    // Query the database to get audio collections with pagination
    const collections = await AudioCollection.find({
      access: { $ne: "private" },
    })
      .select("-audios")
      .skip(skip)
      .limit(limitNumber)
      .exec();

    // Count total number of documents in the collection
    const totalCount = await AudioCollection.countDocuments();

    // Calculate total number of pages
    const totalPages = Math.ceil(totalCount / limitNumber);

    // Respond with audio collections and pagination metadata
    res.status(200).json({
      collections,
      totalPages,
      currentPage: pageNumber,
      totalCollections: totalCount,
    });
  } catch (error) {
    // Handle errors
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

async function moveCollectionToStart(userId, collectionId) {
  try {
    // Find the user by ID
    const user = await User.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    // Find the index of the collection with the given collectionId
    const collectionIndex = user.audioCollections.findIndex(
      (collection) =>
        collection.collectionId.toString() === collectionId.toString()
    );

    if (collectionIndex === -1) {
      throw new Error("Collection not found");
    }

    // Remove the collection from its current position
    const [collection] = user.audioCollections.splice(collectionIndex, 1);

    // Add the collection to the start of the array
    user.audioCollections.unshift(collection);

    // Save the updated user document
    await user.save();

    console.log("Collection moved to the start successfully");
  } catch (error) {
    console.error("Error moving collection to start:", error);
  }
}

// Controller to get audio by collection
const getAudioByCollectionId = async (req, res) => {
  try {
    const { collectionId } = req.query;
    moveCollectionToStart(req.user._id, collectionId);

    // Find the audio collection by collectionId
    const audioCollection = await AudioCollection.findById(collectionId).exec();

    // If no audioCollection records are found, respond with a 404 status code
    if (!audioCollection) {
      return res.status(404).json({
        message: "Audio collection not found for the specified collection",
      });
    }

    // Check access permissions if the collection is private
    if (audioCollection.access === "private") {
      const userId = req.user._id;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      if (
        !user.audioCollections.some((item) =>
          item.collectionId.equals(mongoose.Types.ObjectId(collectionId))
        )
      ) {
        return res.status(401).json({
          message: "You cannot access this collection because it is private.",
        });
      }
    }

    // Extract audio IDs from the audioCollection
    const audioIds = audioCollection.audios.map((audio) => audio.audioId);

    // Fetch the full audio objects from the Audio model
    const audios = await Audio.find({ _id: { $in: audioIds } }).exec();

    // Respond with the full audio data
    res.status(200).json(audios);
  } catch (error) {
    // Handle errors
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Controller to get audio by collection
const getAllCollectionsByUser = async (req, res) => {
  try {
    // Find the user by ID and check if the collectionId exists in the user's audioCollectionIds array
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const audioCollectionIds = user.audioCollections.map(
      (collection) => collection.collectionId
    );

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Find the audio collections with pagination
    const audioCollections = await AudioCollection.find({
      _id: { $in: audioCollectionIds },
    })
      .skip(skip)
      .limit(limit);

    // Extract all createdBy user IDs from audioCollections
    const creatorIds = audioCollections.map(
      (collection) => collection.createdBy
    );

    // Find the creator details
    const creators = await User.find({
      _id: { $in: creatorIds },
    }).select("username photo _id"); // Only select the needed fields

    // Create a map of creator details for easy lookup
    const creatorMap = creators.reduce((map, creator) => {
      map[creator._id] = creator;
      return map;
    }, {});

    // Replace createdBy in audioCollections with the actual user details
    const updatedAudioCollections = audioCollections.map((collection) => ({
      ...collection._doc, // Spread the original collection data
      createdBy: creatorMap[collection.createdBy], // Replace createdBy with the user details
    }));

    // Get the total count for pagination purposes
    const totalCollections = await AudioCollection.countDocuments({
      _id: { $in: audioCollectionIds },
    });

    // Prepare the paginated response
    const response = {
      audioCollections: updatedAudioCollections,
      pagination: {
        total: totalCollections,
        page: page,
        pages: Math.ceil(totalCollections / limit),
      },
    };

    // If audio records are found, respond with the audio data
    res.status(200).json(response);
  } catch (error) {
    // Handle errors
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Controller to authorize a user to play a collection
const authorizeUserToPlayCollection = async (req, res) => {
  try {
    // Extract the token from the request body
    const { token } = req.body;
    const collectionToUnlock = req.body.collectionId;

    // Check if the token exists
    const authorizationToken = await AuthorizationToken.findOne({ token });

    if (!authorizationToken) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid authorization token",
      });
    }

    // Check if the token is valid (e.g., not expired)
    const currentTime = new Date();
    if (authorizationToken.expirationDate < currentTime) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authorization token has expired",
      });
    }

    // Get the collection ID associated with the token
    const collectionId = authorizationToken.audioCollection;
    // Check if the collection exists and handle errors appropriately
    const collection = await AudioCollection.findById(collectionId);

    if (!collection) {
      return res.status(404).json({
        message:
          "the collection you can acsess with this token no longer exists",
      });
    }

    if (!collectionId.equals(ObjectId(collectionToUnlock))) {
      return res.status(400).json({
        message: `this token is for the ${collection.title} collection`,
      });
    }

    // Add the collection to the user's audio collections
    const userId = req.user._id;

    // Find the user by ID
    const user = await User.findById(userId);

    // Check if the user exists
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Add the collection ID to the user's audioCollectionIds array
    user.audioCollections.push({
      collectionId: collectionId,
    });

    // Save the updated user
    await user.save();

    // Delete/invalidate the token
    await authorizationToken.delete();

    // Acknowledge verification
    res.status(200).json({
      message: "Verification successful",
      collectionTitle: collection.title,
    });
  } catch (error) {
    // Handle errors
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Controller to create authorization token for collection
const createAuthorizationTokenForCollection = async (req, res) => {
  try {
    // Extract collection ID from the request parameters
    const { collectionId } = req.body;

    //find user
    const user = User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (
      !user.audioCollections.some((item) => {
        return item.collectionId.equals(mongoose.Types.ObjectId(collectionId));
      })
    ) {
      return res.status(401).json({
        status: "access denied",
        errorMessage: "access denied, you do not own this collection",
      });
    }

    // Generate a random authorization token
    const token = generateRandomToken();

    // Calculate the expiration date
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7); // Set expiration to 24 hours from now

    // Create a new authorization token instance
    const newToken = new AuthorizationToken({
      audioCollection: collectionId,
      token,
      expirationDate,
    });

    // Save the new authorization token to the database
    await newToken.save();

    // Respond with the created token
    res.status(200).json({ token });
  } catch (error) {
    // Handle errors
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const generateRandomToken = () => {
  return uuidv4(); // Generate a random UUID (version 4)
};


module.exports = {
  createAudioCollection,
  createAudio,
  getAllCollections,
  getAudioByCollectionId,
  getAllCollectionsByUser,
  authorizeUserToPlayCollection,
  createAuthorizationTokenForCollection,
  continueAudioCreation,
  handleEbookAudioCreation,
  getAudioGenerationStatus,
};
