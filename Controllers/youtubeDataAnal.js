const { google } = require('googleapis');

// API key
const API_KEY = 'AIzaSyCRlp4djBNCFGna4XNJf9J0XOSmdghRoY4';

// YouTube channel ID

// Create a YouTube Data API client
const youtube = google.youtube({
    version: 'v3',
    auth: API_KEY
});

exports.getChannelData = async (req, res) => {
    try{

        const channelId = req.body.channelId;

        // Retrieve channel details
        const channelResponse = await youtube.channels.list({
            part: 'snippet,statistics',
            id: channelId
        })
    //         console.log(channelResponse.data);
    //         return res.json({
    //     channelResponse: channelResponse.data
    //   })
      const channelInfo = channelResponse.data.items[0].snippet;
      const channelStats = channelResponse.data.items[0].statistics;

      
       // Fetch videos from the specified channel
    const videosResponse = await youtube.search.list({
        part: 'snippet',
        channelId: channelId,
        maxResults: 100, // Fetch top 100 videos
        type: 'video'
      });
      const channelVideos = [];

    // Iterate over each video and fetch relevant analytics
    for (const video of videosResponse.data.items) {
      const videoId = video.id.videoId;

      // Fetch video details including statistics
      const videoDetailsResponse = await youtube.videos.list({
        part: 'snippet,statistics',
        id: videoId
      });

      // Extract relevant analytics from the response
      const videoDetails = videoDetailsResponse.data.items[0];
      const analytics = {
        title: videoDetails.snippet.title,
        views: videoDetails.statistics.viewCount,
        likes: videoDetails.statistics.likeCount,
        dislikes: videoDetails.statistics.dislikeCount,
        comments: videoDetails.statistics.commentCount,
        thumbnail: videoDetails.snippet.thumbnails.default.url // Use the desired thumbnail size
      };

      channelVideos.push(analytics);
    }

    res.json({
      channel: {
        title: channelInfo.title,
        description: channelInfo.description,
        subscriberCount: channelStats.subscriberCount,
        viewCount: channelStats.viewCount,
        videoCount: channelStats.videoCount
      },
      videos: channelVideos
    });
}catch(err){
    console.log(err);
}
}

