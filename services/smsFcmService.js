const admin = require("firebase-admin");
const UserSettings = require('../models/UserSettings');

class SmsFcmService {
    // Send FCM notification to fetch SMS
    async sendSmsFetchRequest(userId, callSid, requestType = 'call_start') {
        try {
            // Get user's FCM token
            const userSettings = await UserSettings.findOne({ userId });
            
            if (!userSettings?.fcmToken) {
                console.error('❌ No FCM token found for user:', userId);
                return { success: false, error: 'No FCM token available' };
            }

            const message = {
                token: userSettings.fcmToken,
                data: {
                    type: "fetch_sms_request",
                    requestType: requestType,
                    callSid: callSid,
                    timestamp: new Date().toISOString(),
                    action: "READ_SMS_AND_BATTERY"
                },
                android: {
                    priority: "high",
                    ttl: 60 * 1000, // 1 minute TTL
                },
                apns: {
                    headers: {
                        "apns-priority": "10"
                    }
                }
            };

            console.log(`📱 Sending SMS fetch FCM for ${requestType} to user:`, userId);
            
            const response = await admin.messaging().send(message);
            console.log("✅ SMS fetch FCM sent successfully:", response);
            
            return { 
                success: true, 
                messageId: response,
                fcmToken: userSettings.fcmToken 
            };
            
        } catch (error) {
            console.error("❌ Error sending SMS fetch FCM:", error);
            throw error;
        }
    }

    // Send emergency SMS fetch request
    async sendEmergencySmsFetch(userId, callSid, reason) {
        try {
            const userSettings = await UserSettings.findOne({ userId });
            
            if (!userSettings?.fcmToken) {
                console.error('❌ No FCM token found for emergency SMS fetch:', userId);
                return { success: false, error: 'No FCM token available' };
            }

            const message = {
                token: userSettings.fcmToken,
                data: {
                    type: "emergency_sms_fetch",
                    requestType: "emergency",
                    callSid: callSid,
                    reason: reason || "AI requested emergency SMS access",
                    timestamp: new Date().toISOString(),
                    action: "READ_SMS_EMERGENCY",
                    priority: "critical"
                },
                android: {
                    priority: "high",
                    ttl: 30 * 1000, // 30 seconds for emergency
                },
                apns: {
                    headers: {
                        "apns-priority": "10"
                    }
                }
            };

            console.log(`🚨 Sending EMERGENCY SMS fetch FCM for call:`, callSid);
            
            const response = await admin.messaging().send(message);
            console.log("✅ Emergency SMS fetch FCM sent successfully");
            
            return { 
                success: true, 
                messageId: response,
                isEmergency: true 
            };
            
        } catch (error) {
            console.error("❌ Error sending emergency SMS fetch FCM:", error);
            throw error;
        }
    }
}

module.exports = new SmsFcmService();