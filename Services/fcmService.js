const admin = require('firebase-admin');
const Device = require('../Models/device');
const Notification = require('../Models/notification');

class FCMService {
  constructor() {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
    }
  }

  async sendToDevice(token, payload) {
    try {
      const message = {
        token,
        notification: {
          title: payload.title,
          body: payload.body
        },
        data: payload.data || {}
      };

      const response = await admin.messaging().send(message);
      return response;
    } catch (error) {
      if (error.code === 'messaging/registration-token-not-registered') {
        await this.removeInvalidToken(token);
      }
      throw error;
    }
  }

  async sendToUser(userId, payload) {
    const devices = await Device.find({ user: userId, isActive: true });
    const messages = devices.map(device => ({
      token: device.fcmToken,
      notification: {
        title: payload.title,
        body: payload.body
      },
      data: payload.data || {}
    }));

    if (messages.length === 0) return [];

    const response = await admin.messaging().sendAll(messages);
    await this.handleFailedDeliveries(response, devices);
    return response;
  }

  async removeInvalidToken(token) {
    await Device.findOneAndUpdate(
      { fcmToken: token },
      { isActive: false }
    );
  }

  async handleFailedDeliveries(response, devices) {
    response.responses.forEach(async (resp, idx) => {
      if (resp.error) {
        if (resp.error.code === 'messaging/registration-token-not-registered') {
          await this.removeInvalidToken(devices[idx].fcmToken);
        }
      }
    });
  }
}

module.exports = new FCMService();