const fcmService = require('../Services/fcmService');
const Device = require('../Models/device');
const Notification = require('../Models/notification');
const rateLimit = require('express-rate-limit');

const notificationLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

const registerDevice = async (req, res) => {
  try {
    const { fcmToken, deviceType, os, appVersion, uniqueIdentifier } = req.body;
    
    let device = await Device.findOne({ uniqueIdentifier });
    
    if (device) {
      device.fcmToken = fcmToken;
      device.isActive = true;
      device.lastUsed = new Date();
    } else {
      device = new Device({
        user: req.user._id,
        fcmToken,
        deviceType,
        os,
        appVersion,
        uniqueIdentifier
      });
    }

    await device.save();

    res.status(200).json({
      status: 'success',
      message: 'Device registered successfully'
    });
  } catch (error) {
    console.error('Device registration error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to register device'
    });
  }
};

const sendNotification = async (req, res) => {
  try {
    const { userId, title, body, type, data } = req.body;

    const notification = await Notification.create({
      recipient: userId,
      title,
      body,
      type,
      data
    });

    const response = await fcmService.sendToUser(userId, {
      title,
      body,
      data: {
        notificationId: notification._id.toString(),
        type,
        ...data
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Notification sent successfully',
      data: response
    });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send notification'
    });
  }
};

const getNotificationHistory = async (req, res) => {
  try {
    const notifications = await Notification.find({ 
      recipient: req.user._id 
    })
    .sort('-createdAt')
    .limit(50);

    res.status(200).json({
      status: 'success',
      data: notifications
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch notifications'
    });
  }
};

module.exports = {
  registerDevice,
  sendNotification,
  getNotificationHistory,
  notificationLimit
};