const mongoose = require("mongoose");
// const { autoSyncElastic } = require("../../Controllers/searchSuggestion")

connectDatabase = async () => {
  await mongoose.connect(
    `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@cluster0.eujsr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`,
    { useNewUrlParser: true }
  );
  // .then(autoSyncElastic())
  console.log("MongoDB Connected Successfully");
};

module.exports = connectDatabase;
