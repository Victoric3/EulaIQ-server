const User = require('../../Models/user'); // Adjust the path to your User model
const { educationalTerms } = require("../../data/educationalTerms")
const { funnyElements } = require("../../data/funnyNames")

// Function to generate a random integer between min and max (inclusive)
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Function to generate a random alphanumeric string
function generateRandomString(length) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// Function to generate a random username
async function generateUniqueUsername() {
  let isUnique = false;
  let username;

  while (!isUnique) {
    // Combine a random educational term and funny element
    const educationalTerm = educationalTerms[getRandomInt(0, educationalTerms.length - 1)];
    const funnyElement = funnyElements[getRandomInt(0, funnyElements.length - 1)];
    // Append a random string to ensure uniqueness
    username = `${educationalTerm}${funnyElement}`;
    const randomString = generateRandomString(5); // Adjust the length as needed
    username += randomString;
    
    // Check if the generated username is unique
    const existingUser = await User.findOne({ username });

    if (!existingUser) {
      isUnique = true;
    }
    // You could add a safeguard here to prevent infinite loops in case of extreme edge cases
    // For example, after a certain number of attempts, return a default username or throw an error

    // You can adjust the number of retries or add additional logic here as needed
  }

  return username;
}

module.exports = { generateUniqueUsername };
