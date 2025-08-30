// services/fcmService.js
const admin = require("firebase-admin");

const sendEmergencyAlert = async (fcmToken, data) => {
  try {
    const message = {
      token: fcmToken,
      data: {
        type: "emergency_alert",   // 👈 must be "data" only (not "notification")
        title: data.title,
        body: data.body,
        callSid: data.callSid,
        callerNumber: data.callerNumber,
        timestamp: data.timestamp,
      },
      android: {
        priority: "high",
        ttl: 0,  // deliver immediately
      }
    };

    const response = await admin.messaging().send(message);
    console.log("📲 Emergency FCM sent:", response);
    return response;
  } catch (error) {
    console.error("❌ Error sending FCM:", error);
    throw error;
  }
};

module.exports = { sendEmergencyAlert };  // ✅ Correct export
