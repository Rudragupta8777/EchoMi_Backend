const admin = require('firebase-admin');

// Ensure Firebase is initialized
if (!admin.apps.length) {
    const serviceAccount = require('../config/firebase-service-account.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const sendEmergencyAlert = async (fcmToken, data) => {
  try {
    const message = {
      token: fcmToken,
      notification: {
        title: data.title,
        body: data.body
      },
      data: {
        type: 'emergency',
        callSid: data.callSid || '',
        callerNumber: data.callerNumber || '',
        timestamp: data.timestamp || new Date().toISOString(),
        priority: data.priority || 'high'
      },
      android: {
        priority: 'high'
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            priority: 'high'
          }
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log('✅ FCM Notification sent successfully:', response);
    return response;
  } catch (error) {
    console.error('❌ Error sending FCM notification:', error);
    throw error;
  }
};

module.exports = { sendEmergencyAlert };