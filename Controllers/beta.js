const { fetchSavedFile } = require('../Helpers/file/saveFile');
const Email = require('../Helpers/Libraries/email');

/**
 * Handle beta program registration
 * @route POST /api/v1/beta/register
 * @access Public
 */
const registerForBeta = async (req, res) => {
  try {
    const { email, fullName } = req.body;

    // Validate input
    if (!email || !fullName) {
      return res.status(400).json({
        success: false,
        message: "Email and full name are required"
      });
    }

    // Create a user object for the email template
    // This mimics the structure expected by the Email class
    const user = {
      email,
      firstname: fullName.split(' ')[0] // Extract first name from full name
    };

    // Direct Google Drive link for the app download
    const downloadUrl = "https://drive.google.com/file/d/1veuoD1150km3zarDmUuVFcydiMAAJDCf/view?usp=sharing";
    
    // Send welcome email with beta program information using the correct method
    // Pass the URL directly to the constructor as second parameter
    await new Email(user, downloadUrl).sendBetaAccess();

    // Return success response
    return res.status(200).json({
      success: true,
      message: "Successfully registered for beta program",
      downloadUrl
    });
  } catch (error) {
    console.error("Beta registration error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during beta registration",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

/**
 * Download the beta app
 * @route GET /api/v1/beta/download
 * @access Public (with email verification)
 */
const downloadBetaApp = async (req, res) => {
  try {
    // Redirect to Google Drive instead of trying to serve the file
    return res.redirect("https://drive.google.com/file/d/1veuoD1150km3zarDmUuVFcydiMAAJDCf/view?usp=sharing");
    
  } catch (error) {
    console.error("Beta app download error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while attempting to download the beta app"
    });
  }
};

module.exports = {
  registerForBeta,
  downloadBetaApp
};