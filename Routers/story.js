const express = require("express")
const imageupload = require("../Helpers/Libraries/imageUpload");

const { getAccessToRoute } = require("../Middlewares/Authorization/auth");
const {addStory,getAllStories,detailStory,likeStory, editStory, deleteStory, editStoryPage } = require("../Controllers/story")
const { checkStoryExist, checkUserAndStoryExist } = require("../Middlewares/database/databaseErrorhandler");

const router = express.Router() ;

router.post("/addstory" ,[getAccessToRoute, imageupload.single("image")],addStory)
router.post("/ckUpload" ,[getAccessToRoute, imageupload.single("image")], (req, res) => {
        // Handle the uploaded image and send a response to CKFinder
        if (!req.file) {
          return res.status(400).json({ error: 'No image uploaded' });
        }
      
        const imageUrl = `/ckUpload/${req.file.filename}`; 
        res.status(200).json({ url: imageUrl });
      })

router.post("/:slug", checkStoryExist, detailStory)

router.post("/:slug/like",[getAccessToRoute,checkStoryExist] ,likeStory)

router.get("/editStory/:slug",[getAccessToRoute,checkStoryExist,checkUserAndStoryExist] , editStoryPage)

router.put("/:slug/edit",[getAccessToRoute,checkStoryExist,checkUserAndStoryExist, imageupload.single("image")] ,editStory)

router.delete("/:slug/delete",[getAccessToRoute,checkStoryExist,checkUserAndStoryExist] ,deleteStory)

router.get("/getAllStories",getAllStories)


module.exports = router