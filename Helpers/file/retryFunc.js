const retry = async (fn, retries = 3, res) => {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        console.log(`Attempt ${attempt} failed. Retrying...`);
        if (res) {
          res.io.emit("text-processing-progress", {
            message: `Attempt ${attempt} failed. Retrying...`,
            attempt,
            error: error.message,
          });
        }
      }
    }
    throw lastError;
  };

module.exports = { retry };