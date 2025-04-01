const express = require("express")


const { profile, editProfile, changePassword, addStoryToReadList, readListPage, checkStoryInReadList, getLikedStoriesPage } = require("../Controllers/user");
const { validateSession } = require("../Middlewares/Authorization/auth");
const { handleImageUpload } = require("../Helpers/Libraries/handleUpload");



const router = express.Router();

router.get("/profile", validateSession, profile)

router.post("/editProfile", [validateSession, handleImageUpload], editProfile) //image

router.put("/changePassword", validateSession, changePassword)

router.post("/:ebookId/addStoryToReadList", validateSession, addStoryToReadList)

router.get("/readList", validateSession, readListPage)

router.get("/readList/check/:ebookId", validateSession, checkStoryInReadList);

router.get("/favorites", validateSession, getLikedStoriesPage);


module.exports = router