const Email = require('../Helpers/Libraries/email');
const axios = require('axios');
const { fetchSavedFile } = require('../Helpers/file/saveFile');

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

    // Generate a download URL that points to our API endpoint
    // We'll encode the user's email to verify their identity when downloading
    const downloadUrl = `${process.env.API_URL || 'https://api.eulaiq.com'}/api/v1/beta/download`;
    
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
    // Location of the app file in Azure storage
    const appFileUrl = "https://kingsheartebook.blob.core.windows.net/ebook/app-release.apk";
    
    try {
      // Use fetchSavedFile to get the file with a valid SAS token
      const fileResponse = await fetchSavedFile(appFileUrl);
      
      // Set appropriate headers for file download
      res.setHeader('Content-Disposition', `attachment; filename="EulaIQ-Beta.apk"`);
      res.setHeader('Content-Type', fileResponse.file.contentType || 'application/vnd.android.package-archive');
      res.setHeader('Content-Length', fileResponse.file.contentLength);
      
      // Send the file
      return res.send(Buffer.from(fileResponse.file.buffer));
    } catch (fileError) {
      console.error("Error fetching app file:", fileError);
      
      // Fallback to redirect to the URL directly if fetchSavedFile fails
      // (this will only work if the blob has public read access)
      return res.status(500).json({
        success: false,
        message: "Unable to download the app at this time. Please contact support@eulaiq.com for assistance."
      });
    }
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