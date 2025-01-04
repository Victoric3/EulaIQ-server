const asyncErrorWrapper = require("express-async-handler");
// const Comment = require("../Models/comment");
const Story = require("../Models/story");
const User = require("../Models/user");
const deleteImageFile = require("../Helpers/Libraries/deleteImageFile");

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
  const { slug } = req.params;
  const { partial, chapter } = req.body;

  try {
    // Parallel fetch of user and story data for better performance
    const [user, story] = await Promise.all([
      User.findById(req.user._id, "free vouchers purchased"),
      Story.findOne(
        { slug },
        "slug content contentTitles free prizePerChapter"
      ),
    ]);

    // Early validation checks
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

    // Function to check if chapter is in free range (0-4)
    const isChapterFree = (chapterIndex) =>
      chapterIndex >= 0 && chapterIndex <= 4;

    // Handle partial content requests
    if (partial && Array.isArray(chapter)) {
      const filteredContent = chapter
        .map((idx) => story.content[idx])
        .filter(Boolean);

      // If all requested chapters are free, return them immediately
      if (chapter.every(isChapterFree)) {
        return res.status(200).json({
          success: true,
          data: {
            content: filteredContent,
            chapterTitle: story.contentTitles || [],
          },
        });
      }

      // If user is premium, grant full access
      if (!user.free) {
        return res.status(200).json({
          success: true,
          data: {
            content: filteredContent,
            chapterTitle: story.contentTitles || [],
          },
        });
      }

      // Handle non-premium users
      const purchasedChapters =
        user.purchased.find((item) => item.slug === slug)?.chapter || [];
      const unpaidChapters = chapter.filter(
        (chap) => !isChapterFree(chap) && !purchasedChapters.includes(chap)
      );

      // If all chapters are either free or purchased, return content
      if (unpaidChapters.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            content: filteredContent,
            chapterTitle: story.contentTitles || [],
          },
          message: "You already have access to these chapters",
        });
      }

      // Check vouchers for unpaid chapters
      const billingAmount = story.prizePerChapter * unpaidChapters.length;
      if (user.vouchers < billingAmount) {
        return res.status(401).json({
          errorType: "insufficient vouchers",
          errorMessage:
            "Insufficient vouchers! Please top up your coins to purchase more vouchers or consider upgrading to premium for unlimited access.",
        });
      }

      // Update user's vouchers and purchased chapters
      user.vouchers -= billingAmount;

      if (purchasedChapters.length) {
        purchasedChapters.push(...unpaidChapters);
        user.markModified("purchased");
      } else {
        user.purchased.push({ slug, chapter: unpaidChapters });
      }

      await user.save();

      return res.status(200).json({
        success: true,
        data: {
          content: filteredContent,
          chapterTitle: story.contentTitles || [],
        },
        message: "Chapters successfully purchased",
      });
    }

    // Handle full content requests
    if (!partial && !story.free && user.free) {
      return res.status(401).json({
        errorMessage: "You need to purchase a premium plan to do this",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        content: story.content,
        chapterTitle: story.contentTitles || [],
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      errorMessage: `Internal server error: ${error}`,
    });
  }
};

const likeStory = async (req, res) => {
  const { slug } = req.params;
  const userId = req.user._id;
  const MAX_RETRIES = 3;
  let retryCount = 0;

  async function attemptUpdate() {
    try {
      // Use lean() for faster query since we don't need the full document
      const [user, story] = await Promise.all([
        User.findById(userId).select("likes").lean(),
        Story.findOne({ slug }).select("likes likeCount author __v").lean(),
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
        .select("likes likeCount")
        .lean();

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
          : {
              $addToSet: { likes: story._id }, // Use addToSet to prevent duplicates
            }
      );

      console.log(
        "data",
        updatedStory,
        `likeStatus: ${hasLiked ? false : true}`
      );

      return res.status(200).json({
        success: true,
        data: updatedStory,
        likeStatus: hasLiked ? false : true,
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

const rateStory = asyncErrorWrapper(async (req, res, next) => {
  const { rating } = req.body;
  const { slug } = req.params;
  console.log("rating: ", rating);
  const activeUser = await User.findOne({ _id: req.user._id });
  if (!activeUser) {
    res.status(404).json({
      errorMessage: "user not found",
    });
  }

  // Validate the rating value
  if (rating < 1 || rating > 5) {
    return res.status(400).json({
      success: false,
      message: "Rating must be between 1 and 5.",
    });
  }

  const story = await Story.findOne({ slug: slug })
    .populate("author ratings.user")
    .select("-content -readTime -likes -comments -authorInfo");

  if (!story) {
    return res.status(404).json({
      success: false,
      message: "Story not found",
    });
  }

  // Check if the user has already rated this story
  const existingRatingIndex = story.ratings.findIndex(
    (i) => i.user._id.toString() === activeUser._id.toString()
  );

  if (existingRatingIndex !== -1) {
    // If the user already rated, update the existing rating
    story.ratings[existingRatingIndex].rating = rating;
  } else {
    // If not, add the new rating
    story.ratings.push({ user: activeUser._id, rating: rating });
  }

  // Calculate new average rating
  const totalRating = story.ratings.reduce((acc, r) => acc + r.rating, 0);
  story.averageRating = totalRating / story.ratings.length;
  story.ratingCount = story.ratings.length;

  // Save the updated story
  await story.save();

  return res.status(200).json({
    success: true,
    data: story,
  });
});

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
  try{

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
  } else if(partial == false) {
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
  }catch(err){
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

const generateStory = async(req, res) => {
  try{
    
  } catch(err) {

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
  generateStory
};
