const express = require("express");
const { registerForBeta, downloadBetaApp } = require("../Controllers/beta");

const router = express.Router();

// Beta registration endpoints
router.post("/register", registerForBeta);
router.get("/download", downloadBetaApp);

module.exports = router;