const express = require("express");

const { validateSession } = require("../Middlewares/Authorization/auth");
const {
  addStory,
  addImage,
  getAllStories,
  detailStory,
  likeStory,
  rateStory,
  editStory,
  deleteStory,
  editStoryPage,
} = require("../Controllers/story");
const {
  checkStoryExist,
  checkUserAndStoryExist,
} = require("../Middlewares/database/databaseErrorhandler");
const { handleImageUpload, handleFileUpload } = require("../Helpers/Libraries/handleUpload");
const { handlegenerateEbook, handleContinueEbookGeneration } = require("../Controllers/file");
const router = express.Router();

router.post("/addstory", [validateSession, handleImageUpload], addStory);
router.post("/handlegenerate", [validateSession, handleFileUpload], handlegenerateEbook);
router.post('/ebooks/:ebookId/continue', validateSession, handleContinueEbookGeneration);
router.post("/addImage", [validateSession, handleImageUpload], addImage);

router.get("/:slug", [validateSession, checkStoryExist], detailStory);

router.post("/:slug/like", [validateSession, checkStoryExist], likeStory);
router.put("/:slug/rate", [validateSession, checkStoryExist], rateStory);

router.get(
  "/editStory/:slug",
  [validateSession, checkStoryExist, checkUserAndStoryExist],
  editStoryPage
);

router.patch(
  "/:slug/edit",
  [
    validateSession,
    checkStoryExist,
    checkUserAndStoryExist,
    handleImageUpload,
  ],
  editStory
); //image

router.delete(
  "/:slug/delete",
  [validateSession, checkStoryExist, checkUserAndStoryExist],
  deleteStory
);

router.get("/getAllStories/:slug", validateSession, getAllStories);

module.exports = router;
