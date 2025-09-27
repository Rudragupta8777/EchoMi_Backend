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
        const { callSid, userId, limit = 50, storageType, forceFresh } = req.body;
        
        // If requesting fresh data and we have userId, trigger new SMS fetch
        if (forceFresh && userId) {
            console.log(`[SMS CONTROLLER] 🔄 Fresh data requested - triggering new SMS fetch for user: ${userId}`);
            // Note: This would require implementing a way to request fresh SMS from mobile app
        }

        // Require either callSid OR userId
        if (!callSid && !userId) {
            return res.status(400).json({
                success: false,
                error: 'Either Call SID or User ID is required'
            });
        }

        let query = {};
        let responseKey = '';
        
        if (callSid) {
            // Fetch messages for specific call
            query = { callSid };
            responseKey = 'callSid';
            console.log(`[SMS CONTROLLER] Fetching SMS for callSid: ${callSid}`);
        } else if (userId) {
            // Fetch latest messages for user across all calls
            query = { userId };
            responseKey = 'userId';
            console.log(`[SMS CONTROLLER] Fetching latest SMS for userId: ${userId}`);
        }

        // Add storage type filter if specified
        if (storageType) {
            query.storageType = storageType;
        }

        // Fetch latest SMS messages - force newest first
        const smsMessages = await Sms.find(query)
            .sort({ timestamp: -1, _id: -1 }) // Sort by timestamp AND _id for true latest-first
            .limit(parseInt(limit))
            .select('phoneNumber message sender timestamp smsType storageType callSid');
            
        console.log(`[SMS CONTROLLER] 📊 Found ${smsMessages.length} messages, latest timestamp: ${smsMessages.length > 0 ? new Date(smsMessages[0].timestamp).toLocaleString() : 'none'}`);

        // Mark SMS as processed if we have a callSid
        if (callSid) {
            await SmsService.markSmsAsProcessed(callSid);
        }

        const responseData = {
            success: true,
            count: smsMessages.length,
            data: smsMessages
        };
        
        responseData[responseKey] = callSid || userId;

        res.status(200).json(responseData);

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