const express = require('express');
const router = express.Router();
const { validateSession } = require("../Middlewares/Authorization/auth");
const { 
  registerDevice, 
  sendNotification, 
  getNotificationHistory,
  notificationLimit 
} = require('../Controllers/notification');

router.use(validateSession);

router.post('/device/register', registerDevice);
router.post('/send', notificationLimit, sendNotification);
router.get('/history', getNotificationHistory);

module.exports = router;