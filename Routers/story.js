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
  getUserEbooks,
  getEbookSectionsCount,
  getEbookSections,
  getEbookSectionTitles
} = require("../Controllers/story");
const { handleImageUpload, handleFileUpload } = require("../Helpers/Libraries/handleUpload");
const { 
  handlegenerateEbook, 
  handleContinueEbookGeneration, 
  getEbookProcessingStatus,
  getEbookProcessingLogs,
  fetchFileForClient
} = require("../Controllers/file");
const { softDeleteEbook, hardDeleteEbook } = require("../Controllers/ebook");
const router = express.Router();

router.post("/addstory", [validateSession, handleImageUpload], addStory);
router.post("/addImage", [validateSession, handleImageUpload], addImage);


router.post("/:id/like", [validateSession], likeStory);
router.put("/:id/rate", [validateSession], rateStory);



router.get(
  "/editStory/:slug",
  [validateSession],
  editStoryPage
);

router.patch(
  "/:slug/edit",
  [
    validateSession,
    handleImageUpload,
  ],
  editStory
); //image

router.delete(
  "/:slug/delete",
  [validateSession],
  deleteStory
);

router.get("/:slug", validateSession, detailStory);
router.get("/getAllStories/:slug", validateSession, getAllStories);
router.get("/:ebookId/sections", validateSession, getEbookSections);
router.get("/:ebookId/sections-count", validateSession, getEbookSectionsCount);
router.get("/:ebookId/sectionTitles", validateSession, getEbookSectionTitles);
router.post("/foruser", validateSession, getUserEbooks);

//generate ebook
router.post("/handlegenerate", [validateSession, handleFileUpload], handlegenerateEbook);
router.post('/:ebookId/continue', validateSession, handleContinueEbookGeneration);
router.get("/:ebookId/status", validateSession, getEbookProcessingStatus);
router.get('/:ebookId/logs', validateSession, getEbookProcessingLogs);
router.get("/ebookfile/fetch", validateSession, fetchFileForClient);
router.put("/:ebookId/softdelete", validateSession, softDeleteEbook);
router.delete("/:ebookId/harddelete", validateSession, hardDeleteEbook);


module.exports = router;
