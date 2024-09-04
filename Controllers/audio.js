const mongoose = require("mongoose");
const AudioCollection = require("../Models/AudioCollection");
const Audio = require("../Models/Audio");
const AuthorizationToken = require("../Models/audioToken");
const User = require("../Models/user");
const { v4: uuidv4 } = require("uuid");
const { ObjectId } = require("mongodb");
const {
  processAudioFiles,
  processTextChunks,
} = require("../Helpers/Libraries/azureOpenai");
const { handleTextProcessing } = require("../Controllers/file");
const { textChunkQueue } = require("../Helpers/Libraries/redis");
// const fs = require("fs-extra");
// const path = require("path");

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

const processRemainingChunks = async (index, collection, processguide, res) => {
  const {
    module,
    moduleDescription,
    voiceActorsArray,
    firstResult,
    previousPage,
  } = processguide;
  const textChunks = collection?.textChunks;

  if (index < textChunks.length) {
    try {
      const result = await processTextChunks(
        index === 1 ? firstResult : previousPage,
        textChunks[index],
        module,
        moduleDescription,
        voiceActorsArray,
        textChunks.length - 1 == index,
        res
      );
      console.log("result: ", result);
      const { audioCollection } = await processAudioFiles(
        result,
        collection,
        index,
        module,
        voiceActorsArray,
        res
      );
      res.io.emit("audio-progress", {
        message: `Successfully generated audio for page ${index + 1}`,
        currentIndex: index + 1,
      });
      console.log(`finished ${index} processing`);

      await processRemainingChunks(
        index + 1,
        audioCollection,
        {
          ...processguide,
          previousPage: result.textChunks.map((item) => item.text).join(" "),
        },
        res
      );
    } catch (error) {
      console.error(`Error processing chunk ${index}:`, error);
      res.io.emit("audio-error", {
        message: `Error processing chunk ${index}`,
        error: error.message,
      });
    }
  } else {
    res.status(200).json({
      message: "Successfully generated all audio",
      collection,
    });
  }
};

const handleAudioCreation = async (req, res) => {
  //access uploaded file
  const file = req.uploadedFile;
  // console.log("file: ", file);
  const { voiceActors, module, moduleDescription, text } = req.body;
  const voiceActorsArray = voiceActors;

  try {
    const { textChunks, description } = await handleTextProcessing(
      module,
      moduleDescription,
      file,
      text,
      res
    );
    console.log("textChunks.length: ", textChunks.length);
    console.log("textChunksFinal: ", textChunks);
    // return res.status(200).json({
    //   textChunks,
    // });

    if (text?.length > 0) {
      textChunks.unshift(text);
      console.log("textChunks with text: ", textChunks);
    } else if (textChunks.length === 0) {
      return res
        .status(400)
        .json({ message: "we couldn't extract any text from the file" });
    }

    //create a collection
    const newCollection = new AudioCollection({
      imageUrl: "https://i.ibb.co/MCPFhMT/headphones-3658441-1920.jpg",
      title: file.originalname,
      description: description.introduction,
      createdBy: req.user.id,
      textChunks: textChunks,
    });

    // Save the new audio collection to the database
    await newCollection.save();
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    user.audioCollections.push({
      collectionId: newCollection._id,
    });
    await user.save();

    const firstResult = await processTextChunks(
      null,
      textChunks[0],
      module,
      moduleDescription,
      voiceActorsArray,
      false,
      res
    );
    console.log("firsttextChunk: ", textChunks[0]);
    console.log("firsttextResult: ", firstResult);
    // Handle audio creation and upload to Azure blob storage for the first text chunk
    const { audioCollection } = await processAudioFiles(
      firstResult,
      newCollection,
      0,
      module,
      voiceActorsArray,
      false,
      res
    );
    // return res.json({
    //   message: "synthesis finished",
    //   collection: audioCollection
    // })
    if (textChunks.length > 1) {
      await processRemainingChunks(
        1,
        audioCollection,
        {
          module,
          moduleDescription,
          voiceActorsArray,
          firstResult: firstResult.textChunks
            .map((item) => item.text)
            .join(" "),
        },
        res
      );

      // for (let i = 1; i < textChunks.length; i++) {
      //   textChunkQueue
      //     .add({
      //       textChunks,
      //       module,
      //       moduleDescription,
      //       collection: newCollection,
      //       index: i,
      //       voiceActors: voiceActorsArray,
      //     })
      //     .then((job) => {
      //       console.log(`Job added for chunk ${i} with job ID: ${job.id}`);
      //     })
      //     .catch((err) => {
      //       console.error(`Error adding job for chunk ${i}:`, err);
      //     });
      // }
    } else {
      res.status(200).json({
        message: "successfully generated audio",
        collection: audioCollection,
      });
    }
  } catch (error) {
    console.error(error);
  }
};

const continueAudioCreation = async (req, res) => {
  const { collectionId, module, moduleDescription, voiceActors } = req.body;

  try {
    const collection = await AudioCollection.findById(collectionId);
    if (!collection) {
      return res.status(404).json({ error: "Collection not found" });
    }
    const currentIndex = collection.audios.length;
    const voiceActorsArray = voiceActors;

    // Start processing remaining chunks
    await processRemainingChunks(
      currentIndex,
      collection,
      {
        module,
        moduleDescription,
        voiceActorsArray,
        firstResult: collection.textChunks[0],
        previousPage: collection.textChunks[currentIndex - 1],
      },
      res
    );
  } catch (error) {
    console.error(error.message);
    res
      .status(500)
      .json({ error: "An error occurred while continuing audio generation" });
  }
};

module.exports = {
  createAudioCollection,
  createAudio,
  getAllCollections,
  getAudioByCollectionId,
  getAllCollectionsByUser,
  authorizeUserToPlayCollection,
  createAuthorizationTokenForCollection,
  handleAudioCreation,
  continueAudioCreation,
};
