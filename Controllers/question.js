const fetch = require('node-fetch');

exports.getQuestion = async (req, res) => {
    // Extract the request data and API key from the request body
    const requestData = req.body;
    const apiKey = process.env.MIDDLEMAN_API_KEY;
    try {
      // Make a request to the external server using the Fetch API
      const response = await fetch(`${process.env.ALPHALEARN3_BASEURL}/api/v1/questions/McqQuestion/${apiKey}/${process.env.API_USERNAME}`, {
        method: 'POST',
        body: JSON.stringify(requestData),
        headers: {
          'Content-Type': 'application/json',
        },
      });
  
      
      const data = await response.json();
      if (!response.ok) {
        return res.status(400).json({
            statusCode: response.statusCode,
            errorMessage: data.errorMessage
        });
      }
  
      // Forward the response from the external server to the client
      res.status(200).json(data);
    } catch (error) {
      // Handle errors and forward them to the client
      res.status(500).json({ errorMessage: `An error occurred while processing the request: ${error}` });
    }
  };