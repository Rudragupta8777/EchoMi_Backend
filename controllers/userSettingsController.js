// controllers/userSettingsController.js
const UserSettings = require('../models/UserSettings');

// In your userSettingsController.js - add logging to see what's happening
const updateFcmToken = async (req, res) => {
    console.log('📱 FCM Token Update Request Received:', {
        headers: req.headers,
        body: req.body,
        user: req.user // Check if user is properly authenticated
    });

    const { fcmToken } = req.body;

    if (!fcmToken) {
        console.error('❌ FCM token is required but was empty');
        return res.status(400).json({ message: 'FCM token is required.' });
    }

    try {
        const updatedSettings = await UserSettings.findOneAndUpdate(
            { userId: req.user._id },
            { fcmToken: fcmToken },
            { 
                upsert: true,
                new: true,
                runValidators: true
            }
        );
        
        console.log('✅ FCM Token updated successfully:', {
            userId: req.user._id,
            storedToken: updatedSettings.fcmToken
        });
        
        res.status(200).json({ 
            message: 'FCM token updated successfully.',
            fcmToken: updatedSettings.fcmToken
        });
    } catch (error) {
        console.error('❌ Error updating FCM token:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const updateBatteryStatus = async (req, res) => {
    const { batteryLevel } = req.body;

    if (batteryLevel === undefined) {
        return res.status(400).json({ message: 'Battery level is required.' });
    }

    try {
        await UserSettings.findOneAndUpdate(
            { userId: req.user._id },
            { lastKnownBatteryLevel: batteryLevel },
            { upsert: true }
        );
        res.status(200).json({ message: 'Battery status updated successfully.' });
    } catch (error) {
        console.error('Error updating battery status:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Add a function to get FCM token for debugging
const getFcmToken = async (req, res) => {
    try {
        const userSettings = await UserSettings.findOne({ userId: req.user._id });
        if (userSettings && userSettings.fcmToken) {
            res.status(200).json({ 
                fcmToken: userSettings.fcmToken,
                exists: true
            });
        } else {
            res.status(404).json({ 
                message: 'FCM token not found',
                exists: false
            });
        }
    } catch (error) {
        console.error('Error getting FCM token:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { updateFcmToken, updateBatteryStatus, getFcmToken };