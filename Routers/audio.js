const express = require("express");
const router = express.Router();
const { getAccessToRoute } = require("../Middlewares/Authorization/auth");
const {
  createAudioCollection,
  createAudio,
  getAllCollections,
  getAudioByCollectionId,
  authorizeUserToPlayCollection,
  createAuthorizationTokenForCollection,
} = require("../Controllers/audio");
const { handleImageUpload } = require("../Helpers/Libraries/handleUpload");

// Routes
router.post(
  "/audio-collections",
  getAccessToRoute,
  handleImageUpload,
  createAudioCollection
); // Route to create an audio collection
router.post("/audios", getAccessToRoute, createAudio); // Route to create an audio
router.get("/audio-collections", getAllCollections); // Route to get all audio collections
router.get(
  "/audios",
  getAccessToRoute,
  getAudioByCollectionId
); // Route to get audio by collection ID
router.post("/authorize", getAccessToRoute, authorizeUserToPlayCollection); 
router.post(
  "/authorization-token",
  getAccessToRoute,
  createAuthorizationTokenForCollection
); // Route to create an authorization token for a collection

module.exports = router;
