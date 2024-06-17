const mongoose = require("mongoose")
const { autoSyncElastic } = require("../../Controllers/searchSuggestion")

connectDatabase =async  () => {

    await mongoose.connect(`mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@cluster0.40erpcv.mongodb.net/?retryWrites=true&w=majority` ,{useNewUrlParser : true})
    .then(autoSyncElastic())
    console.log("MongoDB Connected Successfully")

}

module.exports = connectDatabase
