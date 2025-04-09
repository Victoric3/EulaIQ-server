const Story = require('../Models/story');
const { deleteFileFromAzure } = require('../Helpers/file/saveFile');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Load ebook covers from JSON file
const ebookCoversPath = path.join(__dirname, '..', 'data', 'ebookCovers.json');
const ebookCovers = JSON.parse(fs.readFileSync(ebookCoversPath, 'utf8'));
const coverKeys = Object.keys(ebookCovers);

const createEbook = async (req, file) => {
  console.log("started creating ebook");
  try {
    // Select a random cover image from the available covers
    const randomIndex = Math.floor(Math.random() * coverKeys.length);
    const randomCoverKey = coverKeys[randomIndex];
    const coverImageUrl = ebookCovers[randomCoverKey];
    
    console.log(`Selected random cover: ${randomCoverKey}`);

    const story = new Story({
      title: file.originalname.replace(/\.[^/.]+$/, ""),
      author: req.user._id,
      image: coverImageUrl || req.user.photo,
      status: "processing",
      description: "This story is being processed. Please check back later.",
      coverKey: randomCoverKey, // Optionally store which cover was selected
    });

    await story.save();

    return story;
  } catch (error) {
    console.error('Error creating story from file:', error);
    throw new Error(`Failed to create story: ${error.message}`);
  }
};

const getEbookById = async (storyId) => {
  console.log("started getting ebook");
  try {
    
    const story = await Story.findById(storyId)

    if (!story) {
      throw new Error('Ebook not found');
    }

    console.log("gotten ebook: ", story._id);
    return story;
  } catch (error) {
    console.error('Error fetching story:', error);
    throw new Error(`Failed to fetch story: ${error.message}`);
  }
};

const getEbooksForUser = async (userId, page = 1, limit = 10, searchQuery = "", filterBy = "") => {
  try {
    // Calculate skip value for pagination
    const skip = (page - 1) * limit;
    
    // Start building the query
    let matchStage = { author: mongoose.Types.ObjectId(userId) };
    
    // Apply search query if provided
    if (searchQuery) {
      matchStage.$or = [
        { title: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } }
      ];
    }
    
    // Apply filters based on filterBy parameter
    if (filterBy) {
      switch (filterBy) {
        case 'complete':
          matchStage.status = 'complete';
          break;
        case 'processing':
          matchStage.status = 'processing';
          break;
        case 'audio':
          matchStage['audioCollections.0'] = { $exists: true };
          break;
        case 'quiz':
          matchStage['questions.0'] = { $exists: true };
          break;
        // The 'recent' filter will be handled in sort
        case 'all':
        default:
          // No additional filter for 'all'
          break;
      }
    }

    // Build the aggregation pipeline
    const pipeline = [
      { $match: matchStage },
      { $project: {
          title: 1,
          description: 1,
          image: 1,
          status: 1,
          slug: 1,
          createdAt: 1,
          updatedAt: 1,
          averageRating: 1,
          ratingCount: 1,
          processingError: 1,
          contentTitles: 1,
          audioCollections: 1,
          questions: 1,
          hasAudio: { 
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$audioCollections", []] } }, 0] }, 
              true, 
              false
            ] 
          },
          hasQuizzes: { 
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$questions", []] } }, 0] }, 
              true, 
              false
            ] 
          }
      }},
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ];
    
    // Execute the aggregation pipeline
    const stories = await Story.aggregate(pipeline);
    
    // Get total count for pagination with the same filters
    const countPipeline = [
      { $match: matchStage },
      { $count: "total" }
    ];
    const countResult = await Story.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);
    
    console.log(`Found ${stories.length} ebooks for user with filter: ${filterBy}`);
    
    return {
      ebooks: stories,
      pagination: {
        currentPage: page,
        totalPages,
        totalEbooks: total,
        hasMore: page < totalPages
      }
    };
  } catch (error) {
    console.error('Error fetching user ebooks:', error);
    throw new Error(`Failed to fetch user ebooks: ${error.message}`);
  }
};

/**
 * Detects and resets stalled ebook processing
 * @param {Number} timeThresholdMinutes - Minutes after which processing is considered stalled
 */
const detectStalledProcessing = async (timeThresholdMinutes = 60) => {
  try {
    console.log("Checking for stalled ebook processing...");
    const timeThreshold = new Date();
    timeThreshold.setMinutes(timeThreshold.getMinutes() - timeThresholdMinutes);

    // Find ebooks that have been processing for too long without updates
    const stalledEbooks = await Story.find({
      status: "processing",
      "processingDetails.lastUpdated": { $lt: timeThreshold }
    });

    console.log(`Found ${stalledEbooks.length} stalled ebooks`);

    // Update each stalled ebook
    for (const ebook of stalledEbooks) {
      ebook.status = "error";
      ebook.processingError = "Processing stalled and timed out";
      await ebook.updateProcessingStatus('failed', 'Processing stalled and timed out');
      await ebook.logProgress(`Processing appears to have stalled. No updates for ${timeThresholdMinutes} minutes.`, 'error');
      await ebook.save();
      console.log(`Reset stalled ebook: ${ebook._id}`);
    }

    return stalledEbooks.length;
  } catch (error) {
    console.error('Error detecting stalled processing:', error);
    return 0;
  }
};

/**
 * Soft delete an ebook - mark as deleted but keep in database
 */
const softDeleteEbook = async (req, res) => {
  try {
    const { ebookId } = req.params;
    
    // Find the ebook
    const ebook = await Story.findById(ebookId);
    
    if (!ebook) {
      return res.status(404).json({
        success: false,
        message: "Ebook not found"
      });
    }
    
    // Check if the current user is the author
    if (ebook.author.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this ebook"
      });
    }
    
    // Soft delete by setting isDeleted to true
    ebook.isDeleted = true;
    await ebook.save();
    
    return res.status(200).json({
      success: true,
      message: "Ebook has been moved to trash"
    });
  } catch (error) {
    console.error("Error in softDeleteEbook:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete ebook",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

/**
 * Permanently delete an ebook - remove from database, Azure storage, and all references
 */
const hardDeleteEbook = async (req, res) => {
  try {
    const { ebookId } = req.params;
    
    // Find the ebook
    const ebook = await Story.findById(ebookId);
    
    if (!ebook) {
      return res.status(404).json({
        success: false,
        message: "Ebook not found"
      });
    }
    
    // Check if the current user is the author
    if (ebook.author.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this ebook"
      });
    }
    
    // Start cleanup operations
    const cleanupOperations = [];
    
    // 1. Clean up readList references
    cleanupOperations.push(
      User.updateMany(
        { readList: ebookId },
        { $pull: { readList: ebookId }, $inc: { readListLength: -1 } }
      )
    );
    
    // 2. Clean up like/favorites references
    cleanupOperations.push(
      User.updateMany(
        { likes: ebookId },
        { $pull: { likes: ebookId } }
      )
    );
    
    // 3. Clean up comments (if using separate Comments collection)
    if (mongoose.modelNames().includes('Comment')) {
      const Comment = mongoose.model('Comment');
      cleanupOperations.push(Comment.deleteMany({ story: ebookId }));
    }
    
    // 4. Delete the file from Azure if it exists
    if (ebook.fileUrl) {
      cleanupOperations.push(deleteFileFromAzure(ebook.fileUrl));
    }
    
    // Execute all cleanup operations concurrently
    await Promise.all(cleanupOperations);
    
    // Finally, delete the ebook document from database
    await Story.findByIdAndDelete(ebookId);
    
    return res.status(200).json({
      success: true,
      message: "Ebook has been permanently deleted and all references cleaned up"
    });
  } catch (error) {
    console.error("Error in hardDeleteEbook:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete ebook permanently",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Update the module exports to include the new functions
module.exports = {
  createEbook,
  getEbookById,
  getEbooksForUser,
  detectStalledProcessing,
  softDeleteEbook,
  hardDeleteEbook
};