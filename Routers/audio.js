const express = require("express");
const router = express.Router();
const { validateSession } = require("../Middlewares/Authorization/auth");
const {
  createAudioCollection,
  createAudio,
  getAllCollections,
  getAudioByCollectionId,
  getAllCollectionsByUser,
  authorizeUserToPlayCollection,
  createAuthorizationTokenForCollection,
  handleEbookAudioCreation,
  continueAudioCreation
} = require("../Controllers/audio");
const {
  handleImageUpload,
} = require("../Helpers/Libraries/handleUpload");

// Routes
router.post(
  "/audio-collections",
  validateSession,
  handleImageUpload,
  createAudioCollection
);
router.post("/audios", validateSession, createAudio);
router.get("/audio-collections", getAllCollections);
router.get("/audiosById", validateSession, getAudioByCollectionId);
router.get("/audiosByUser", validateSession, getAllCollectionsByUser);
router.post("/authorize", validateSession, authorizeUserToPlayCollection);
router.post(
  "/authorization-token",
  validateSession,
  createAuthorizationTokenForCollection
);
router.post(
  "/generateAudio",
  validateSession,
  handleEbookAudioCreation
);
router.post(
  "/continueAudioGeneration",
  validateSession,
  continueAudioCreation
);

module.exports = router;
