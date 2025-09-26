const Sms = require('../models/Sms');

class SmsService {
    // Store bulk SMS messages for a call with type differentiation
    async storeCallSms(userId, callSid, smsMessages, storageType = 'regular') {
        try {
            if (!smsMessages || smsMessages.length === 0) {
                console.log('No SMS messages to store');
                return [];
            }

            const smsDocuments = smsMessages.map(sms => ({
                userId,
                callSid,
                phoneNumber: sms.phoneNumber,
                message: sms.message,
                sender: sms.sender,
                timestamp: new Date(sms.timestamp),
                smsType: sms.smsType || 'inbox',
                storageType: storageType,
                isProcessed: false
            }));

            const result = await Sms.insertMany(smsDocuments);
            console.log(`✅ Stored ${result.length} SMS messages for call ${callSid} (Type: ${storageType})`);
            return result;
        } catch (error) {
            console.error('Error storing SMS messages:', error);
            throw error;
        }
    }

    // Get latest SMS for a specific call (with optional type filter)
    async getLatestSmsByCall(callSid, limit = 20, storageType = null) {
        try {
            let query = { callSid };
            if (storageType) {
                query.storageType = storageType;
            }

            const smsMessages = await Sms.find(query)
                .sort({ timestamp: -1 })
                .limit(limit)
                .select('phoneNumber message sender timestamp smsType storageType');

            return {
                success: true,
                count: smsMessages.length,
                callSid: callSid,
                storageType: storageType || 'all',
                data: smsMessages
            };
        } catch (error) {
            console.error('Error fetching SMS messages:', error);
            throw error;
        }
    }

    // Check if SMS already exists for a call with specific type
    async hasSmsForCall(callSid, storageType = null) {
        try {
            let query = { callSid };
            if (storageType) {
                query.storageType = storageType;
            }
            
            const count = await Sms.countDocuments(query);
            return count > 0;
        } catch (error) {
            console.error('Error checking SMS existence:', error);
            return false;
        }
    }

    // Mark SMS as processed after AI uses them
    async markSmsAsProcessed(callSid) {
        try {
            const result = await Sms.updateMany(
                { callSid, isProcessed: false },
                { $set: { isProcessed: true } }
            );
            console.log(`✅ Marked ${result.modifiedCount} SMS as processed for call ${callSid}`);
            return result;
        } catch (error) {
            console.error('Error marking SMS as processed:', error);
            throw error;
        }
    }
}

module.exports = new SmsService();