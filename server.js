const express = require("express")
const dotenv = require("dotenv")
const cors = require("cors")
const path = require("path")
const rateLimit = require('express-rate-limit');
const IndexRoute = require("./Routers/index")
const connectDatabase = require("./Helpers/database/connectDatabase")
const customErrorHandler = require("./Middlewares/Errors/customErrorHandler")

dotenv.config({ path: './config.env' })

connectDatabase()

const app = express() ;

app.use(express.json())
rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 1000, // 1000 requests per minute
    keyGenerator: (req) => {
      // Use the user object to identify the user
      return req.user
    },
  });
app.use(cors())

app.get('/', (req, res) => {
    res.send('server successfully running');
  });
app.use("/",IndexRoute)

app.use(customErrorHandler)

const PORT = process.env.PORT || 5000 ;

app.use(express.static(path.join(__dirname , "public") ))

const server = app.listen(PORT,()=>{

    console.log(`Server running on port  ${PORT} : ${process.env.NODE_ENV}`)

})

process.on("unhandledRejection",(err , promise) =>{
    console.log(`Logged Error : ${err}`)

    server.close(()=>process.exit(1))
})