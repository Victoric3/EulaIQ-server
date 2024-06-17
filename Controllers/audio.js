const mongoose = require("mongoose");
const AudioCollection = require("../Models/AudioCollection");
const Audio = require("../Models/Audio");
const AuthorizationToken = require("../Models/audioToken");
const User = require("../Models/user");
const { v4: uuidv4 } = require("uuid");
const { ObjectId } = require("mongodb");
const { extractAndParseJSON } = require("../Helpers/input/escapeStrinedJson");
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
    const { title, description } = req.body;

    // Create a new audio collection instance
    const newCollection = new AudioCollection({
      imageUrl:
        req.imageUrl || "https://i.ibb.co/MCPFhMT/headphones-3658441-1920.jpg", // If imageUrl is not provided in the request, it will be the default image
      title,
      description,
      createdBy: req.user._id,
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
    const collections = await AudioCollection.find()
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

// Controller to get audio by collection
const getAudioByCollectionId = async (req, res) => {
  try {
    const { collectionId, deviceInfo } = req.query;
    // Get the current user's ID
    const userId = req.user._id;

    // Find the user by ID and check if the collectionId exists in the user's audioCollectionIds array
    const user = await User.findById(userId);
    let audio;
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    // Query the database to find audio records that belong to the specified collection

    if (
      user.audioCollections.some((item) => {
        return (
          item.collectionId.equals(mongoose.Types.ObjectId(collectionId)) &&
          item.device === deviceInfo
        );
      })
    ) {
      audio = await AudioCollection.findById(collectionId).exec();
    } else {
      return res
        .status(401)
        .json({ message: "You need to purchase this audio to listen" });
    }

    // If no audio records are found for the collection, respond with a 404 status code
    if (!audio) {
      return res
        .status(404)
        .json({ message: "Audio not found for the specified collection" });
    }

    // If audio records are found, respond with the audio data
    res.status(200).json(audio.audios);
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
    const { token, deviceInfo } = req.body;
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
      device: deviceInfo,
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
    const { collectionId, adminPass } = req.body;
    if (adminPass !== process.env.Admin_Pass) {
      return res
        .status(401)
        .json({ message: "you are not allowed to do this" });
    }
    // Generate a random authorization token
    const token = generateRandomToken();

    // Calculate the expiration date (e.g., 24 hours from now)
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
    res.status(201).json({ token });
  } catch (error) {
    // Handle errors
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const generateRandomToken = () => {
  return uuidv4(); // Generate a random UUID (version 4)
};

const handleAudioCreation = async (req, res) => {
  //access uploaded file
  const file = req.uploadedFile;
  const {  voiceActors, module, moduleDescription } = req.body;
  const voiceActorsArray = JSON.parse(voiceActors);
  let cleanedFirstResultData;
  try {
    const { textChunks, description } = await handleTextProcessing(
      module,
      moduleDescription,
      file
    );
    if(textChunks.length === 0){
      return res.json({message: "we couldn't extract any text from the file"})
    }
    //create a collection
    const newCollection = new AudioCollection({
      imageUrl: "https://i.ibb.co/MCPFhMT/headphones-3658441-1920.jpg",
      title: file.originalname,
      description: description.introduction,
      createdBy: req.user.id,
      textChunks
    });

    // Save the new audio collection to the database
    await newCollection.save();
    req.user.audioCollections.push(newCollection);

    // Process the first text chunk and send a response
    const firstResult = await processTextChunks(
      null,
      textChunks[0],
      module,
      moduleDescription,
      voiceActorsArray
    );
    if(firstResult === null){
      cleanedFirstResultData = null
    }else{
      // Clean gpt4's result for audio generation
      cleanedFirstResultData = extractAndParseJSON(firstResult);
    }
    // console.log("firstResult: ", firstResult);
    // console.log("cleanedFirstResultData: ", cleanedFirstResultData);

    // Handle audio creation and upload to Azure blob storage for the first text chunk
    await processAudioFiles(
      cleanedFirstResultData,
      newCollection,
      0,
      module,
      voiceActorsArray
    );

    if (textChunks.length > 1) {
      for (let i = 1; i < textChunks.length; i++) {
        textChunkQueue
          .add({
            textChunks,
            module,
            moduleDescription,
            collection: newCollection,
            index: i,
            voiceActors : voiceActorsArray,
          })
          .then((job) => {
            console.log(`Job added for chunk ${i} with job ID: ${job.id}`);
          })
          .catch((err) => {
            console.error(`Error adding job for chunk ${i}:`, err);
          });
      }
      res.status(200).json({
        message: "successfully generated audio",
        collection: newCollection,
      });
    }
  } catch (error) {
    console.error(error.message);
  }
};

module.exports = {
  createAudioCollection,
  createAudio,
  getAllCollections,
  getAudioByCollectionId,
  authorizeUserToPlayCollection,
  createAuthorizationTokenForCollection,
  handleAudioCreation,
};
