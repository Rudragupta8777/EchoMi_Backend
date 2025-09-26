const Sms = require('../models/Sms');
const User = require('../models/User');
const SmsService = require('../services/smsService');
const { sendSmsFetchRequest } = require('../services/fcmService');
const UserSettings = require('../models/UserSettings');

// @desc    Get latest SMS messages for a specific call
// @route   POST /api/sms/call/latest
// @access  Private (AI Model access)
const getLatestSmsByCall = async (req, res) => {
    try {
        const { callSid, limit = 20, storageType } = req.body;

        if (!callSid) {
            return res.status(400).json({
                success: false,
                error: 'Call SID is required'
            });
        }

        // Fetch latest SMS messages for this call
        const smsMessages = await Sms.find({ callSid })
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .select('phoneNumber message sender timestamp smsType storageType');

        // Mark SMS as processed since AI is using them
        await SmsService.markSmsAsProcessed(callSid);

        res.status(200).json({
            success: true,
            count: smsMessages.length,
            callSid: callSid,
            data: smsMessages
        });

    } catch (error) {
        console.error('Error fetching SMS messages:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while fetching SMS messages'
        });
    }
};

// @desc    Store SMS messages for a call (called by mobile app)
// @route   POST /api/sms/call/store
// @access  Private
const storeCallSms = async (req, res) => {
    console.log('📱 Received SMS store request:', {
        body: req.body,
        headers: req.headers
    });

    try {
        const { userId, callSid, smsMessages, storageType = 'regular' } = req.body;

        if (!userId || !callSid || !smsMessages) {
            console.error('❌ Missing required fields');
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: userId, callSid, smsMessages'
            });
        }

        console.log(`📱 Storing ${smsMessages.length} SMS messages for call ${callSid}`);

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Check if SMS already stored for this call with same type
        const hasExistingSms = await SmsService.hasSmsForCall(callSid, storageType);
        if (hasExistingSms) {
            return res.status(200).json({
                success: true,
                message: `SMS already stored for this call (type: ${storageType})`,
                count: 0,
                storageType: storageType
            });
        }

        // Store SMS messages
        const result = await SmsService.storeCallSms(userId, callSid, smsMessages, storageType);

        res.status(201).json({
            success: true,
            message: `Stored ${result.length} SMS messages for call`,
            count: result.length,
            callSid: callSid,
            storageType: storageType
        });

    } catch (error) {
        console.error('Error storing SMS messages:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while storing SMS messages'
        });
    }
};

// @desc    Trigger SMS fetch from mobile app
// @route   POST /api/sms/call/trigger-fetch
// @access  Private
const triggerSmsFetch = async (req, res) => {
    try {
        const { userId, callSid, storageType = 'regular', limit = 20 } = req.body;

        if (!userId || !callSid) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: userId, callSid'
            });
        }

        // Get user's FCM token
        const userSettings = await UserSettings.findOne({ userId });
        if (!userSettings?.fcmToken) {
            return res.status(404).json({
                success: false,
                error: 'FCM token not found for user'
            });
        }

        // Send FCM notification to mobile app
        await sendSmsFetchRequest(userSettings.fcmToken, {
            callSid,
            userId,
            storageType,
            limit,
            timestamp: new Date().toISOString()
        });

        res.status(200).json({
            success: true,
            message: `SMS fetch triggered for call ${callSid}`,
            storageType: storageType,
            limit: limit
        });

    } catch (error) {
        console.error('Error triggering SMS fetch:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while triggering SMS fetch'
        });
    }
};

module.exports = {
    getLatestSmsByCall,
    storeCallSms,
    triggerSmsFetch
};