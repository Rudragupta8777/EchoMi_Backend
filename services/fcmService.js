const admin = require("firebase-admin");

// Verify Firebase admin is initialized
const verifyFirebaseAdmin = () => {
  try {
    if (admin.apps.length === 0) {
      console.error("❌ Firebase Admin not initialized!");
      return false;
    }
    console.log("✅ Firebase Admin is initialized");
    return true;
  } catch (error) {
    console.error("❌ Firebase Admin verification failed:", error);
    return false;
  }
};

// FCM Token validation and retry helper
const sendWithRetry = async (message, maxRetries = 2) => {
  let lastError;
  
  // Verify Firebase admin before attempting to send
  if (!verifyFirebaseAdmin()) {
    throw new Error("Firebase Admin not properly initialized");
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📲 FCM attempt ${attempt}/${maxRetries}`);
      console.log(`📲 Sending to token: ${message.token.substring(0, 20)}...`);
      
      const response = await admin.messaging().send(message);
      console.log(`✅ FCM sent successfully on attempt ${attempt}:`, response);
      return { success: true, response, attempt };
    } catch (error) {
      lastError = error;
      console.error(`❌ FCM attempt ${attempt} failed:`, error.code || error.message);
      console.error(`❌ Full error:`, error);
      
      // If token is invalid/expired, don't retry immediately
      if (error.code === 'messaging/registration-token-not-registered' || 
          error.code === 'messaging/invalid-registration-token') {
        console.log(`🔄 Token appears invalid, will retry after brief delay...`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        }
      }
    }
  }
  
  return { success: false, error: lastError };
};

// Emergency alert function with retry logic
const sendEmergencyAlert = async (fcmToken, data) => {
  try {
    console.log('📱 Sending emergency alert FCM...');
    
    const message = {
      token: fcmToken,
      data: {
        type: "emergency_alert",
        title: data.title,
        body: data.body,
        callSid: data.callSid || '',
        callerNumber: data.callerNumber || '',
        timestamp: data.timestamp || new Date().toISOString(),
      },
      android: {
        priority: "high",
        ttl: 0,
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: data.title,
              body: data.body
            },
            sound: "default",
            badge: 1
          }
        }
      }
    };

    const result = await sendWithRetry(message, 3);
    if (result.success) {
      return result.response;
    } else {
      throw result.error;
    }
  } catch (error) {
    console.error("❌ Emergency FCM failed completely:", error);
    throw error;
  }
};

// SMS fetch request with retry logic and better logging
const sendSmsFetchRequest = async (fcmToken, data) => {
  try {
    console.log('📱 Sending SMS fetch FCM request...', {
      callSid: data.callSid,
      userId: data.userId,
      storageType: data.storageType
    });
    
    const message = {
      token: fcmToken,
      data: {
        type: "fetch_sms_request",
        callSid: data.callSid.toString(),
        userId: data.userId.toString(),
        timestamp: new Date().toISOString(),
        storageType: data.storageType || "regular",
        limit: data.limit ? data.limit.toString() : "20"
      },
      android: {
        priority: "high",
        ttl: 30, // 30 second TTL for SMS fetch
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

    const result = await sendWithRetry(message, 2);
    if (result.success) {
      console.log(`✅ SMS Fetch FCM sent successfully after ${result.attempt} attempt(s)`);
      return result.response;
    } else {
      console.error(`❌ SMS Fetch FCM failed after all retries:`, result.error.code);
      throw result.error;
    }
  } catch (error) {
    console.error("❌ SMS Fetch FCM failed completely:", error);
    throw error;
  }
};

// OTP Approval request with aggressive retry logic
const sendOTPApprovalRequest = async (fcmToken, data) => {
  try {
    console.log('📱 Sending OTP approval request FCM...', {
      company: data.company,
      callerNumber: data.callerNumber
    });
    
    const message = {
      token: fcmToken,
      data: {
        type: "otp_approval_request",
        company: data.company || '',
        callerNumber: data.callerNumber || '',
        callSid: data.callSid || '',
        approvalId: data.approvalId || '',
        timestamp: new Date().toISOString(),
      },
      notification: {
        title: `🔐 OTP Approval Required`,
        body: `${data.company} delivery person needs OTP approval from ${data.callerNumber}`,
      },
      android: {
        priority: "high",
        ttl: 0, // No TTL for approval requests
        notification: {
          channelId: "otp_approval",
          priority: "high",
          defaultSound: true,
          defaultVibrateTimings: true
        }
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: `🔐 OTP Approval Required`,
              body: `${data.company} delivery needs your approval`
            },
            sound: "default",
            badge: 1,
            category: "OTP_APPROVAL"
          }
        }
      }
    };

    const result = await sendWithRetry(message, 3); // More retries for critical approvals
    if (result.success) {
      console.log(`✅ OTP Approval FCM sent successfully after ${result.attempt} attempt(s)`);
      return result.response;
    } else {
      console.error(`❌ OTP Approval FCM failed after all retries:`, result.error.code);
      throw result.error;
    }
  } catch (error) {
    console.error("❌ OTP Approval FCM failed completely:", error);
    throw error;
  }
};

// Test function to verify FCM is working
const testFCM = async (fcmToken) => {
  try {
    console.log('🧪 Testing FCM functionality...');
    const testMessage = {
      token: fcmToken,
      data: {
        type: "test_notification",
        message: "FCM test successful",
        timestamp: new Date().toISOString()
      },
      notification: {
        title: "Test Notification",
        body: "This is a test to verify FCM is working"
      }
    };
    
    const result = await sendWithRetry(testMessage, 1);
    if (result.success) {
      console.log('✅ FCM test successful!');
      return { success: true };
    } else {
      console.error('❌ FCM test failed:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('❌ FCM test error:', error);
    return { success: false, error };
  }
};

module.exports = { 
  sendEmergencyAlert, 
  sendSmsFetchRequest,
  sendOTPApprovalRequest,
  testFCM
};