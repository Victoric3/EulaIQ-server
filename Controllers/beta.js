const Email = require('../Helpers/Libraries/email');
const axios = require('axios'); // Make sure axios is installed: npm install axios --save

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
    const user = {
      email,
      firstname: fullName.split(' ')[0] // Extract first name from full name
    };

    // Direct Google Drive link for the app download
    const downloadUrl = "https://drive.google.com/file/d/1veuoD1150km3zarDmUuVFcydiMAAJDCf/view?usp=sharing";
    
    // Define Google Sheet submission URL
    const SHEET_URL = 'https://script.google.com/macros/s/AKfycbyAeJRU_5lE93Ao8wrtQWnC1VSz0ftKa_4RxLe9ME1Qp2XKJCz1QMVMzfOxlQqK3Wda/exec';
    
    // Submit to Google Sheets
    try {
      await axios.post(SHEET_URL, {
        timestamp: new Date().toISOString(),
        fullName: fullName,
        email: email
      }, {
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        }
      });
      console.log('User saved to Google Sheet successfully');
    } catch (sheetError) {
      console.error('Error saving to Google Sheet:', sheetError.message);
      // We'll continue even if Google Sheet fails, to ensure user gets their email
    }
    
    // Send welcome email with beta program information
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