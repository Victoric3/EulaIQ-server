const Story = require('../Models/story');

const createEbook = async (req, file) => {
  console.log("started creating ebook");
  try {
    const story = new Story({
      title: file.originalname.replace(/\.[^/.]+$/, ""), // Remove extension
      author: req.user.id,
      image: req.user.photo,
      status: "processing",
      description: "This story is being processed. Please check back later.",
    });

    await story.save();
    console.log("finished creating ebook");
    return story._id;
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
      throw new Error('Story not found');
    }

    console.log("gotten ebook: ", story._id);
    return story;
  } catch (error) {
    console.error('Error fetching story:', error);
    throw new Error(`Failed to fetch story: ${error.message}`);
  }
};

module.exports = {
  createEbook,
  getEbookById
};