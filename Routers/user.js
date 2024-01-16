const express = require("express")


const {profile,editProfile,changePassword,addStoryToReadList,readListPage} = require("../Controllers/user");
const { getAccessToRoute } = require("../Middlewares/Authorization/auth");
const handleImageUpload = require("../Helpers/Libraries/handleImageUpload");



const router = express.Router();

router.get("/profile",getAccessToRoute ,profile)

router.post("/editProfile",[getAccessToRoute, handleImageUpload] ,editProfile) //image

router.put("/changePassword",getAccessToRoute,changePassword)

router.post("/:slug/addStoryToReadList",getAccessToRoute ,addStoryToReadList)

router.get("/readList",getAccessToRoute ,readListPage)



module.exports = router