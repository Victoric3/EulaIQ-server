const mongoose = require("mongoose")

connectDatabase =async  () => {

    await mongoose.connect(`mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@cluster0.40erpcv.mongodb.net/?retryWrites=true&w=majority` ,{useNewUrlParser : true})

    console.log("MongoDB Connection Successfully")

}

module.exports = connectDatabase
