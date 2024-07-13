const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

async function scrapeJobs(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  // Increase the navigation timeout further
  await page.setDefaultNavigationTimeout(90000); // 90 seconds
  
  try {
    await page.goto(url, { waitUntil: "networkidle2" });

    let jobs = [];
    let hasNextPage = true;

    while (hasNextPage) {
      const newJobs = await page.evaluate(() => {
        const jobNodes = document.querySelectorAll(
          ".jobsearch-SerpJobCard, .jobsearch-ResultCard"
        );
        const filteredJobs = Array.from(jobNodes)
          .map((node) => {
            const title = node.querySelector(".title a, .jobTitle")?.innerText;
            const description = node.querySelector(
              ".summary, .job-snippet"
            )?.innerText;
            const jobUrl = node.querySelector(".title a, .jobTitle")?.href;
            const postingDate = node.querySelector(".date")?.innerText;

            return { title, description, jobUrl, postingDate };
          })
          .filter((job) => {
            const titleMatch =
              job.title &&
              (job.title.toLowerCase().includes("front end developer") ||
                job.title.toLowerCase().includes("full stack developer"));
            const dateMatch =
              job.postingDate &&
              (job.postingDate.toLowerCase().includes("today") ||
                job.postingDate.toLowerCase().includes("3 days ago") ||
                job.postingDate.toLowerCase().includes("2 days ago") ||
                job.postingDate.toLowerCase().includes("1 day ago"));
            return titleMatch && dateMatch;
          });

        return filteredJobs;
      });

      jobs = jobs.concat(newJobs);

      hasNextPage = await page.evaluate(() => {
        const nextButton = document.querySelector(
          '.pagination a[aria-label="Next"]'
        );
        if (nextButton) {
          nextButton.click();
          return true;
        }
        return false;
      });

      if (hasNextPage) {
        await page.waitForNavigation({ waitUntil: "networkidle2" });
      }
    }

    await browser.close();
    return jobs;
  } catch (err) {
    console.log("Web scraping error: ", err);
    throw err; // Rethrow the error to handle it in the calling code
  }
}

scrapeJobs("https://www.google.com")
  .then((jobs) => console.log(jobs))
  .catch((error) => console.error("Job scraping error: ", error));
