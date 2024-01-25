const express = require('express');
const sitemap = require('sitemap');
const { db } = require('../Models/user');
const Story = require('../Models/story');
const Exam = require('../Models/exam')

const router = express.Router() ;

// Static pages
const staticPages = [
    '/', 
    '/resetpassword', 
    '/forgotpassword',
    '/register',
    '/login',
    '/readList',
    '/change_Password',
    '/edit_profile',
    '/examHistory',
    '/profile',
    '/addstory',
    '/resultTemp',
    '/questionDisplay',
    '/customExam',
    '/topicByTopic',
    '/jamb',
    '/terms-of-service',
    '/privacy-policy',
    '/allExams'
];

// Dynamic pages (replace with your dynamic page fetching logic)

router.get('/sitemap.xml', async (req, res) => {
    const smStream = new sitemap.SitemapStream({ hostname: 'https://kingsheart.com.ng' });

    const slugs = await Story.find({}, 'slug');
    const slugList = slugs.map((story) => story.slug);
    const examTitle = await Exam.find()
    .select({ _id: 1 })
    .lean()
    .exec();
    console.log(examTitle);

    // Add dynamic pages to the sitemap
    slugList.forEach((page) => {
      smStream.write({ url: `/story/${page}`, changefreq: 'daily', priority: 1.0 });
    });
    examTitle?.forEach((page) => {
      smStream.write({ url: `/allExams/${page._id}`, changefreq: 'daily', priority: 1.0 });
    });
    
    // Add static pages to the sitemap
    staticPages.forEach((page) => {
      smStream.write({ url: page, changefreq: 'monthly', priority: 1.0 });
    });

  smStream.end();
  res.header('Content-Type', 'application/xml');
  smStream.pipe(res);
});

module.exports = router