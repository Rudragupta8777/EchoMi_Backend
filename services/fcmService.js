const admin = require("firebase-admin");

// Emergency alert function (existing)
const sendEmergencyAlert = async (fcmToken, data) => {
  try {
    const message = {
      token: fcmToken,
      data: {
        type: "emergency_alert",
        title: data.title,
        body: data.body,
        callSid: data.callSid,
        callerNumber: data.callerNumber,
        timestamp: data.timestamp,
      },
      android: {
        priority: "high",
        ttl: 0,
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

// Fixed function for SMS fetch notification - Convert all values to strings
const sendSmsFetchRequest = async (fcmToken, data) => {
  try {
    const message = {
      token: fcmToken,
      data: {
        type: "fetch_sms_request",
        callSid: data.callSid.toString(),
        userId: data.userId.toString(),
        timestamp: new Date().toISOString(),
        storageType: data.storageType || "regular",
        limit: data.limit ? data.limit.toString() : "20" // Convert number to string
      },
      android: {
        priority: "high",
        ttl: 60, // 1 minute TTL
      },
      apns: {
        payload: {
          aps: {
            contentAvailable: true,
            sound: "default"
          }
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log("📱 SMS Fetch FCM sent:", response);
    return response;
  } catch (error) {
    console.error("❌ Error sending SMS fetch FCM:", error);
    throw error;
  }
};

module.exports = { 
  sendEmergencyAlert, 
  sendSmsFetchRequest 
};