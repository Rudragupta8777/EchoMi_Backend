const admin = require('firebase-admin');

// Ensure Firebase is initialized
if (!admin.apps.length) {
    const serviceAccount = require('../config/firebase-service-account.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const sendEmergencyAlert = async (fcmToken, message) => {
    const payload = {
        token: fcmToken,
        notification: {
            title: '🚨 URGENT ALERT!',
            body: `An emergency was detected in a call. Message: "${message}"`,
        },
        android: {
            priority: 'high',
            notification: {
                sound: 'default',
                channel_id: 'emergency_channel', 
            }
        },
        apns: {
            payload: {
                aps: {
                    sound: 'default',
                    badge: 1,
                }
            }
        },
        data: {
            type: 'emergency_alert',
        }
    };

    try {
        console.log(`Sending FCM notification to token: ${fcmToken}`);
        const response = await admin.messaging().send(payload);
        console.log('Successfully sent message:', response);
    } catch (error) {
        console.error('Error sending FCM message:', error);
    }
};

module.exports = { sendEmergencyAlert };
