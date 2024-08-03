const express = require("express");
const router = express.Router();
const { getAccessToRoute } = require("../Middlewares/Authorization/auth");
const {
  createAudioCollection,
  createAudio,
  getAllCollections,
  getAudioByCollectionId,
  getAllCollectionsByUser,
  authorizeUserToPlayCollection,
  createAuthorizationTokenForCollection,
  handleAudioCreation,
  continueAudioCreation
} = require("../Controllers/audio");
const {
  handleImageUpload,
  handleFileUpload,
} = require("../Helpers/Libraries/handleUpload");

// Routes
router.post(
  "/audio-collections",
  getAccessToRoute,
  handleImageUpload,
  createAudioCollection
);
router.post("/audios", getAccessToRoute, createAudio);
router.get("/audio-collections", getAllCollections);
router.get("/audiosById", getAccessToRoute, getAudioByCollectionId);
router.get("/audiosByUser", getAccessToRoute, getAllCollectionsByUser);
router.post("/authorize", getAccessToRoute, authorizeUserToPlayCollection);
router.post(
  "/authorization-token",
  getAccessToRoute,
  createAuthorizationTokenForCollection
);
router.post(
  "/generateAudio",
  getAccessToRoute,
  handleFileUpload,
  handleAudioCreation
);
router.post(
  "/continueAudioGeneration",
  getAccessToRoute,
  continueAudioCreation
);

module.exports = router;
