const Story = require('../Models/story');

const createEbook = async (req, file) => {
  try {
    const story = new Story({
      title: file.originalname.replace(/\.[^/.]+$/, ""), // Remove extension
      content: [], // Will be populated during text extraction
      contentTitles: [],
      summaries: [],
      audioCollections: [],
      questions: [],
      author: req.user.id,
      image: req.user.photo,
      status: "processing-1",
      description: "This story is being processed. Please check back later.",
    });

    await story.save();
    return story._id;
  } catch (error) {
    console.error('Error creating story from file:', error);
    throw new Error(`Failed to create story: ${error.message}`);
  }
};

const getEbookById = async (storyId) => {
  try {
    const story = await Story.findById(storyId)
      .populate('author', 'name email')

    if (!story) {
      throw new Error('Story not found');
    }

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