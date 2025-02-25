const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const IndexRoute = require("./Routers/index");
const connectDatabase = require("./Helpers/database/connectDatabase");
const customErrorHandler = require("./Middlewares/Errors/customErrorHandler");
const cookieParser = require("cookie-parser");
const http = require("http");
const socketIo = require("socket.io");
const cron = require('node-cron');

dotenv.config({ path: "./config.env" });

connectDatabase();

const app = express();

app.use(express.json());
rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute
  keyGenerator: (req) => {
    // Use the user object to identify the user
    return req.user;
  },
});
const corsOptions = {
  origin: process.env.URL,
  credentials: true,
};
app.use(cors(corsOptions));
app.use(cookieParser());

const server = http.createServer(app);
const io = socketIo(server);

// Middleware to attach io to res object
app.use((req, res, next) => {
  res.io = io;
  next();
});

app.get("/", (req, res) => {
  res.send("server successfully running");
});
app.use("/", IndexRoute);
app.use(customErrorHandler);

// API Version and Base URL setup
const routes = require('./Routers');
app.use(process.env.API_VERSION, routes);

const port = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  console.log("a user connected");
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});

// Run cleanup every day at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    const users = await User.find({});
    for (const user of users) {
      await user.cleanupSessions();
    }
    console.log('Session cleanup completed');
  } catch (error) {
    console.error('Session cleanup failed:', error);
  }
});

server.listen(port, () => {
  console.log(`Server running on port ${port} : ${process.env.NODE_ENV}`);
});

process.on("unhandledRejection", (err, promise) => {
  console.log(`Logged Error: ${err}`);
  server.close(() => process.exit(1));
});
