const asyncErrorWrapper = require("express-async-handler");
// const Comment = require("../Models/comment");
const Story = require("../Models/story");
const User = require("../Models/user");
const deleteImageFile = require("../Helpers/Libraries/deleteImageFile");
const { getEbooksForUser } = require("./ebook");
const { detectStalledProcessing } = require("./ebook");
const os = require('os');
const path = require('path');
const fs = require('fs');
const EPub = require('epub-gen');

const calculateReadTime = (chapter) => {
  const wordCount = chapter?.trim().split(/\s+/).length;
  return Math.floor(wordCount / 200);
};

const addStory = async (req, res, next) => {
  let { title, content, summary, tags, prizePerChapter, free, contentTitles } =
    req.body;
  content = JSON.parse(content);
  tags = JSON.parse(tags);
  contentTitles = JSON.parse(contentTitles);
  //only admins are allowed to create stories
  if (req.user.role !== "admin") {
    return res.status(401).json({
      status: "unAuthorized",
      errorMessage: "you need to have admin access to do this",
    });
  }

  const shortContent = content.filter((item) => item.length < 100);
  if (shortContent.length > 0) {
    console.error(
      `Content must be at least 100 characters.`,
      shortContent
    );
    res.status(400).json({
      success: false,
      errorMessage: "Each chapter must be at least 100 characters.",
    });
  }
  // Ensure content is an array of chapters (strings)
  if (!Array.isArray(content)) {
    return res.status(400).json({
      success: false,
      errorMessage: "Content must be an array of chapters",
    });
  }

  // Calculate readtime based on word count
  let readtime = content.map((chapter) => calculateReadTime(chapter));
  try {
    const newStory = await Story.create({
      title,
      content,
      author: req.user._id,
      image: req.fileLink || "https://i.ibb.co/Jx8zhtr/story.jpg",
      readTime: readtime,
      tags,
      summary,
      prizePerChapter,
      free,
      contentTitles: contentTitles.length > 0 ? contentTitles : [],
      contentCount: content.length,
    });

    // Send a success response with the newStory data
    return res.status(200).json({
      success: true,
      message: "Add story successfully",
      data: newStory,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      status: "failed",
      errorMessage: error,
    });
  }
};

const addImage = asyncErrorWrapper(async (req, res, next) => {
  try {
    if (!req.fileLink) {
      return res.status(400).json({
        success: false,
        errorMessage: "file could not be processed",
      });
    }
    res.status(200).json({
      success: true,
      message: "file uploaded successfully",
      url: req.fileLink,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      errorMessage: error || "internal server error",
    });
  }
});

const getAllStories = async (req, res) => {
  try {
    const { specific } = req.body;
    const { slug } = req.params;
    const searchQuery = req.query.search || "";
    const authorUsername = req.query.author;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * pageSize;
    const userId = req.user?._id;

    const pipeline = [
      // Stage 1: Add likeCount from array length and calculate rank points
      {
        $addFields: {
          likeCount: {
            $cond: {
              if: { $isArray: "$likes" },
              then: { $size: "$likes" },
              else: 0,
            },
          },
          contentCount: {
            $cond: {
              if: { $isArray: "$content" },
              then: { $size: "$content" },
              else: 0,
            },
          },
        },
      },
      {
        $addFields: {
          rankPoints: {
            $add: [
              { $multiply: ["$commentCount", 2] },
              "$likeCount",
              {
                $cond: [
                  { $gte: ["$averageRating", 3] },
                  { $multiply: ["$averageRating", "$ratingCount", 10] },
                  {
                    $multiply: [
                      { $subtract: [3, "$averageRating"] },
                      "$ratingCount",
                      -10,
                    ],
                  },
                ],
              },
            ],
          },
        },
      },

      // Stage 2: Join with users collection
      {
        $lookup: {
          from: "users",
          let: { authorId: "$author" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$authorId"] } } },
            { $project: { username: 1 } },
          ],
          as: "authorInfo",
        },
      },
      { $unwind: "$authorInfo" },

      // Stage 3: Add author username filter if provided
      ...(authorUsername
        ? [
          {
            $match: {
              "authorInfo.username": authorUsername,
            },
          },
        ]
        : []),

      // Stage 4: Add like status if user is authenticated
      ...(userId
        ? [
          {
            $addFields: {
              likeStatus: {
                $in: [
                  { $toObjectId: userId.toString() },
                  {
                    $map: {
                      input: { $ifNull: ["$likes", []] },
                      as: "like",
                      in: { $toObjectId: "$$like" },
                    },
                  },
                ],
              },
            },
          },
        ]
        : []),

      // Add search query if provided
      ...(searchQuery
        ? [
          {
            $match: {
              $or: [
                { title: { $regex: new RegExp(searchQuery, "i") } },
                { summary: { $regex: new RegExp(searchQuery, "i") } },
              ],
            },
          },
        ]
        : []),

      // Handle specific and tag filtering
      ...(specific && slug === "recent" ? [{ $sort: { createdAt: -1 } }] : []),

      ...(specific
        ? [{ $match: { tags: slug } }, { $sort: { rankPoints: -1 } }]
        : []),

      ...(slug
        ? [
          {
            $addFields: {
              rankPoints: {
                $add: [
                  "$rankPoints",
                  {
                    $multiply: [
                      {
                        $size: {
                          $setIntersection: [
                            "$tags",
                            slug.split("+").filter(Boolean),
                          ],
                        },
                      },
                      1000,
                    ],
                  },
                ],
              },
            },
          },
          { $sort: { rankPoints: -1 } },
        ]
        : []),

      // Default sort by rankPoints if not recent
      { $sort: { rankPoints: -1 } },

      // Add final stages for pagination
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: pageSize },
            {
              $project: {
                _id: 1,
                title: 1,
                slug: 1,
                summary: 1,
                tags: 1,
                image: 1,
                readTime: 1,
                free: 1,
                prizePerChapter: 1,
                createdAt: 1,
                updatedAt: 1,
                author: {
                  _id: "$author",
                  username: "$authorInfo.username",
                },
                likeCount: 1,
                commentCount: 1,
                averageRating: 1,
                ratingCount: 1,
                rankPoints: 1,
                contentCount: 1,
                likeStatus: { $ifNull: ["$likeStatus", false] },
                contentTitles: 1,
              },
            },
          ],
        },
      },
    ];

    // Execute aggregation
    const [result] = await Story.aggregate(pipeline);
    const { metadata, data } = result;
    const totalCount = metadata[0]?.total || 0;
    console.log("story result: ", result);

    return res.status(200).json({
      success: true,
      count: data.length,
      data: data,
      page: page,
      pages: Math.ceil(totalCount / pageSize),
      total: totalCount,
    });
  } catch (error) {
    console.error("Error in getAllStories:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const detailStory = async (req, res) => {
  try {
    console.log("Getting detailed ebook");

    // First check for ID in query params, then check slug in route params
    const ebookId = req.query.id;
    const { slug } = req.params;

    let story;
    const fieldsToExclude = { sections: 0 }; // Exclude sections field

    // If ID is provided, use it first
    if (ebookId) {
      console.log("Finding by ebook ID:", ebookId);
      story = await Story.findById(ebookId, fieldsToExclude).lean();
    }
    // Otherwise use slug
    else if (slug) {
      console.log("Finding by slug:", slug);
      story = await Story.findOne({ slug }, fieldsToExclude).lean();
    } else {
      return res.status(400).json({
        success: false,
        message: "Either ID or slug must be provided"
      });
    }

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Ebook not found"
      });
    }

    // Limit contentTitles to first 10
    if (story.contentTitles && story.contentTitles.length > 10) {
      story.contentTitles = story.contentTitles.slice(0, 10);
      story.hasMoreContentTitles = true; // Flag indicating more are available
    }

    return res.status(200).json({
      success: true,
      data: story
    });
  } catch (error) {
    console.error("Error in detailStory:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch ebook details",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

const likeStory = async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const MAX_RETRIES = 3;
  let retryCount = 0;

  async function attemptUpdate() {
    try {
      // Use lean() for faster query and only select what's needed
      const [user, story] = await Promise.all([
        User.findById(userId).select("likes").lean(),
        Story.findById(id).select("likes likeCount __v").lean(),
      ]);

      if (!user) {
        return res.status(404).json({
          success: false,
          errorMessage: "User not found",
        });
      }

      if (!story) {
        return res.status(404).json({
          success: false,
          errorMessage: "Story not found",
        });
      }

      // Check if user has already liked the story
      const hasLiked = user.likes?.some(
        (likedStoryId) => likedStoryId.toString() === story._id.toString()
      );

      // Use findOneAndUpdate with version key check
      const updatedStory = await Story.findOneAndUpdate(
        {
          _id: story._id,
          __v: story.__v, // Version check
        },
        [
          {
            $set: {
              likes: {
                $cond: {
                  if: { $eq: [hasLiked, true] },
                  then: {
                    $filter: {
                      input: "$likes",
                      cond: { $ne: ["$$this", userId] },
                    },
                  },
                  else: {
                    // Ensure we don't add duplicate likes
                    $cond: {
                      if: { $in: [userId, "$likes"] },
                      then: "$likes",
                      else: { $concatArrays: ["$likes", [userId]] },
                    },
                  },
                },
              },
            },
          },
          {
            $set: {
              likeCount: { $size: "$likes" },
              __v: { $add: ["$__v", 1] }, // Increment version
            },
          },
        ],
        {
          new: true,
          runValidators: true,
        }
      )
        .select("likeCount") // Only select what's needed
        .lean(); // Use lean() to improve performance

      if (!updatedStory && retryCount < MAX_RETRIES) {
        retryCount++;
        return await attemptUpdate();
      }

      if (!updatedStory) {
        return res.status(409).json({
          success: false,
          errorMessage: "Concurrent update detected. Please try again.",
        });
      }

      // Update user's likes array
      await User.findOneAndUpdate(
        { _id: userId },
        hasLiked
          ? { $pull: { likes: story._id } }
          : { $addToSet: { likes: story._id } }
      );

      return res.status(200).json({
        success: true,
        data: updatedStory,
        likeStatus: !hasLiked
      });
    } catch (error) {
      if (error.name === "VersionError" && retryCount < MAX_RETRIES) {
        retryCount++;
        return await attemptUpdate();
      }

      console.error("Error in likeStory:", error);
      return res.status(500).json({
        success: false,
        errorMessage: "Internal server error",
      });
    }
  }

  return attemptUpdate();
};

const rateStory = async (req, res, next) => {
  const { rating } = req.body;
  const { id } = req.params;
  const userId = req.user._id;
  const MAX_RETRIES = 3;
  let retryCount = 0;

  try {

    // Validate the rating value
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5.",
      });
    }

    async function attemptRatingUpdate() {
      try {
        console.log("STARTED getting story for rating");

        // Use findById with lean() and minimal field selection
        const story = await Story.findById(id)
          .select("ratings averageRating ratingCount __v")
          .lean();

        if (!story) {
          return res.status(404).json({
            success: false,
            message: "Story not found",
          });
        }

        // Find existing rating index without populating
        const existingRatingIndex = story.ratings.findIndex(
          (r) => r.user.toString() === userId.toString()
        );

        // The error is in how updateOperation is being used - we need to restructure this
        let updateQuery;

        if (existingRatingIndex !== -1) {
          // Update existing rating
          updateQuery = {
            $set: { [`ratings.${existingRatingIndex}.rating`]: rating },
          };
        } else {
          // Add new rating
          updateQuery = {
            $push: { ratings: { user: userId, rating } },
          };
        }

        // Use findOneAndUpdate with version check - NOT using pipeline array syntax
        const updatedStory = await Story.findOneAndUpdate(
          {
            _id: story._id,
            __v: story.__v // Version check
          },
          updateQuery,
          {
            new: true,
            runValidators: true
          }
        );

        // Now calculate average in a separate update
        if (updatedStory) {
          // Calculate average rating
          const ratings = updatedStory.ratings.map(r => r.rating);
          const averageRating = ratings.length > 0 ?
            ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0;

          // Update the average and count
          updatedStory.averageRating = averageRating;
          updatedStory.ratingCount = ratings.length;
          updatedStory.__v += 1; // Increment version
          await updatedStory.save();

          return res.status(200).json({
            success: true,
            data: {
              averageRating: updatedStory.averageRating,
              ratingCount: updatedStory.ratingCount
            }
          });
        }

        if (retryCount < MAX_RETRIES) {
          retryCount++;
          return await attemptRatingUpdate();
        }

        return res.status(409).json({
          success: false,
          message: "Concurrent update detected. Please try again."
        });
      } catch (error) {
        if (error.name === "VersionError" && retryCount < MAX_RETRIES) {
          retryCount++;
          return await attemptRatingUpdate();
        }

        console.error("Error in rateStory:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to update rating",
          error: process.env.NODE_ENV === "development" ? error.message : undefined
        });
      }
    }

    return attemptRatingUpdate();
  }
  catch (error) {
    console.error("Error in rateStory:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update rating",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });

  }
};

const editStoryPage = asyncErrorWrapper(async (req, res, next) => {
  const { slug } = req.params;

  const story = await Story.findOne({
    slug: slug,
  }).populate("author likes");

  return res.status(200).json({
    success: true,
    data: story,
  });
});

const editStory = async (req, res) => {
  try {

    const { slug } = req.params;
    let { title, content, partial, contentTitles, chapter, tags, summary } =
      req.body;
    // console.log(
    //   title,
    //   "content: ", content,
    //   "partial: ", partial,
    //   "chapter: ", chapter,
    //   "tags: ", tags,
    //   "contentTitles: ",
    //   contentTitles
    // );
    content = JSON.parse(content);
    contentTitles = JSON.parse(contentTitles);
    chapter = chapter ? JSON.parse(chapter) : chapter;
    if (req.user.role !== "admin") {
      return res.status(401).json({
        errorMessage: "you are not allowed to do this",
      });
    }
    const shortContent = content.filter((item) => item.length < 100);
    if (shortContent.length > 0 && chapter.length > 0) {
      console.error(
        `Content must be at least 100 characters.`,
        shortContent
      );
      return res.status(400).json({
        success: false,
        errorMessage: "Each chapter must be at least 100 characters.",
      });
    }
    const story = await Story.findOne({ slug: slug });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found",
      });
    }
    const previousImage = story.image;
    story.title = title || story.title;
    story.contentTitles = contentTitles || story.contentTitles;
    story.tags = tags ? JSON.parse(tags) : story.tags;
    story.summary = summary || story.summary;
    story.image = req.fileLink;

    if (!req.fileLink) {
      story.image = previousImage;
    } else {
      // if the image sent, delete the old image
      deleteImageFile(req, previousImage);
    }

    // Update content based on whether it is partial or full
    if (partial == true && Array.isArray(chapter) && chapter.length > 0 && content) {
      // Update specific chapters
      chapter.forEach((index, i) => {
        if (index >= 0 && index < story.content.length) {
          // If the index exists in the story content, replace the content at that index
          story.content[index] = content[i];
        } else {
          // If the index does not exist, push the new content
          story.content.push(content[i]);
        }
      });

      story.markModified("content");
    } else if (partial == false) {
      // If not partial, overwrite the entire content
      story.content = [...content];
      story.contentCount = content.length;
      // console.log("story.content: ", story.content);
      story.markModified("content");
    }

    // console.log("content", content, "partial: ", partial);

    await story.save();

    return res.status(200).json({
      success: true,
      data: story,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      errorMessage: error
    })
  }
};

const deleteStory = asyncErrorWrapper(async (req, res, next) => {
  const { slug } = req.params;

  const story = await Story.findOne({ slug: slug });

  deleteImageFile(req, story.image);

  await story.remove();

  return res.status(200).json({
    success: true,
    message: "Story delete succesfully ",
  });
});

const getUserEbooks = async (req, res) => {
  try {
    console.log("started getting ebook for user");

    // Check for stalled processing before returning results
    // Only run this occasionally to avoid overhead (e.g., 5% chance)
    if (Math.random() < 0.05) {
      await detectStalledProcessing(60); // Reset ebooks processing for >60 minutes
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const searchQuery = req.query.search || "";
    const filterBy = req.query.filter || "";
    const userId = req.user._id;

    const result = await getEbooksForUser(userId, page, limit, searchQuery, filterBy);

    return res.status(200).json({
      success: true,
      data: result.ebooks,
      pagination: result.pagination
    });
    
  } catch (error) {
    console.error('Error in getUserEbooks:', error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user ebooks",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

const getEbookSections = async (req, res) => {
  const { ebookId } = req.params;
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  const EPub = require('epub-gen');
  
  const tempDir = os.tmpdir();
  const epubFileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}.epub`;
  const epubFilePath = path.join(tempDir, epubFileName);

  console.log("ebookId: ", ebookId);

  try {
    // Find ebook and select necessary fields
    const ebook = await Story.findById(ebookId)
      .select('sections contentTitles title slug _id image author description tags')
      .lean();
      
    if (!ebook) {
      return res.status(404).json({
        success: false,
        message: "Ebook not found"
      });
    }
    
    // Get author information
    const authorName = ebook.author ? ebook.author.username : "Unknown Author";

    // Group sections by head/subhead structure
    const chapters = [];
    let currentHeadSection = null;
    let currentHeadContent = '';
    let currentHeadTitle = '';
    
    // Process each section
    ebook.sections.forEach((section) => {
      // Process the content to wrap tables in scrollable containers
      let processedContent = section.content.replace(
        /(<table[^>]*>[\s\S]*?<\/table>)/g, 
        '<div class="table-container">$1</div>'
      );
      
      if (section.type === 'head') {
        // Remove the duplicate title from processedContent if it exists
        // This will detect and remove heading tags containing the section title
        const titlePattern = new RegExp(`<h[1-6][^>]*>\\s*${escapeRegExp(section.title)}\\s*</h[1-6]>`, 'i');
        processedContent = processedContent.replace(titlePattern, '');
        
        // If we already have a head section, add it to chapters before starting new one
        if (currentHeadSection) {
          chapters.push({
            title: currentHeadTitle,
            data: currentHeadContent,
            beforeToc: false
          });
        }
        
        // Start a new head section - title will come from chapter metadata
        currentHeadSection = section;
        currentHeadTitle = section.title;
        currentHeadContent = `
          <div class="chapter-content">
            ${processedContent}
          </div>
        `;
      } else if (section.type === 'sub' && currentHeadSection) {
        // Remove the duplicate title from processedContent if it exists
        const titlePattern = new RegExp(`<h[1-6][^>]*>\\s*${escapeRegExp(section.title)}\\s*</h[1-6]>`, 'i');
        processedContent = processedContent.replace(titlePattern, '');
        
        // Add subsection to current head section with explicit title (not duplicated)
        currentHeadContent += `
          <div class="subchapter">
            <h3 class="subchapter-title">${section.title}</h3>
            ${processedContent}
          </div>
        `;
      }
    });
    
    // Add the last head section if it exists
    if (currentHeadSection) {
      chapters.push({
        title: currentHeadTitle,
        data: currentHeadContent,
        beforeToc: false
      });
    }
    
    // FIX #4: Improved CSS for titles and other elements
    const customCSS = `
      /* Main chapter title - displayed in reader navigation */
      .chapter-title {
        font-size: 1.2em;
        font-weight: 600;
        font-family: 'Georgia', serif;
        color: #2c3e50;
        margin: 1.5em 0 1em;
        text-align: left;
      }
      
      /* Subchapter titles */
      .subchapter-title {
        font-size: 0.8em;
        font-weight: 500;
        font-family: 'Georgia', serif;
        color: #34495e;
        margin: 1.2em 0 0.7em;
        border-bottom: 1px solid #eee;
        padding-bottom: 0.3em;
      }
      
      /* Basic content structure */
      .chapter-content {
        page-break-before: always;
        margin: 0 0.5em;
      }
      
      .subchapter {
        margin-top: 1.8em;
      }
      
      /* Text elements */
      p {
        margin-bottom: 0.8em;
        line-height: 1.5;
        text-align: justify;
      }
      
      /* Table styling */
      table {
        width: 100%;
        margin: 1.5em 0;
        border-collapse: collapse;
        font-size: 0.9em;
      }
      
      th, td {
        padding: 0.7em;
        border: 1px solid #ddd;
        text-align: left;
      }
      
      th {
        background-color: #f5f5f5;
        font-weight: 600;
        color: #333;
      }
      
      /* FIX #2: Improved figure description styling */
      .figure-reference, .image {
        margin: 2em 0;
        padding: 1em 1.2em;
        background-color: #f8f9fa;
        border-left: 4px solid #4b6cb7;
        border-radius: 3px;
        font-style: italic;
        color: #555;
        line-height: 1.6;
      }
      
      /* Lists */
      ul, ol {
        margin: 1em 0 1em 1.5em;
      }
      
      li {
        margin-bottom: 0.5em;
        line-height: 1.5;
      }
      
      /* Links */
      a {
        color: #3498db;
        text-decoration: none;
      }
      
      /* Emphasis */
      strong {
        font-weight: 600;
        color: #2c3e50;
      }
      
      em {
        font-style: italic;
      }
      
      /* Table overflow handling */
      .table-container {
        width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch; /* For iOS momentum scrolling */
        margin: 1.5em 0;
        position: relative;
      }
      
      table {
        width: 100%;
        min-width: 600px; /* Force wide tables to trigger scrolling */
        border-collapse: collapse;
        font-size: 0.9em;
      }
    `;

    // Configure EPUB generation options
    const epubOptions = {
      title: ebook.title,
      author: authorName,
      publisher: "EulaIQ",
      cover: ebook.image || "https://i.ibb.co/Jx8zhtr/story.jpg",
      content: chapters,
      appendChapterTitles: true,
      customOpfTemplatePath: null,
      customNcxTocTemplatePath: null,
      customHtmlTocTemplatePath: null,
      lang: "en",
      
      // FIX #3: Remove Table of Contents by setting empty title
      includeToc: false, // This disables the HTML TOC
      tocTitle: "",      // Empty title ensures no TOC in the navigation
      
      version: 3,
      description: ebook.description || "No description available",
      genres: ebook.tags || [],
      css: customCSS,
      fonts: [],
      verbose: false
    };

    // Create the EPUB file
    await new EPub(epubOptions, epubFilePath).promise;

    // Send the EPUB file as download
    return res.download(
      epubFilePath, 
      `${ebook.title.replace(/[^\w\s]/gi, '')}.epub`, 
      async (err) => {
        if (err) {
          console.error("Error sending EPUB file:", err);
        }

        // Clean up the temporary file
        try {
          fs.unlinkSync(epubFilePath);
        } catch (unlinkError) {
          console.error("Error deleting temporary EPUB:", unlinkError);
        }
      }
    );
  } catch (error) {
    console.error("Error in getEbookSections:", error);
    
    // Clean up in case of error
    try {
      if (fs.existsSync(epubFilePath)) {
        fs.unlinkSync(epubFilePath);
      }
    } catch (unlinkError) {
      console.error("Error deleting temporary EPUB after error:", unlinkError);
    }
    
    return res.status(500).json({
      success: false,
      message: "Failed to generate EPUB file",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Add this helper function for safe regex escaping
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const getEbookSectionsCount = async (req, res) => {
  try {
    const { ebookId } = req.params;
    
    // Find ebook and select only the minimal fields needed
    const ebook = await Story.findById(ebookId)
      .select('_id sections.length status processingStatus')
      .lean();
      
    if (!ebook) {
      return res.status(404).json({
        success: false,
        message: "Ebook not found"
      });
    }
    
    // Calculate section count
    const sectionCount = ebook.sections ? ebook.sections.length : 0;
    
    return res.status(200).json({
      success: true,
      data: {
        _id: ebook._id,
        sectionCount: sectionCount,
        status: ebook.status,
        processingStatus: ebook.processingStatus,
        needsUpdate: ebook.status === 'processing' || ebook.processingStatus !== 'complete'
      }
    });
  } catch (error) {
    console.error("Error in getEbookSectionsCount:", error);
    return res.status(500).json({
      success: false, 
      message: "Failed to fetch ebook section count",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

module.exports = {
  addStory,
  addImage,
  getAllStories,
  detailStory,
  likeStory,
  rateStory,
  editStoryPage,
  editStory,
  deleteStory,
  getUserEbooks,
  getEbookSections,
  getEbookSectionsCount
};
