const UserSettings = require('../models/UserSettings');

const updateFcmToken = async (req, res) => {
    const { fcmToken } = req.body;

    if (!fcmToken) {
        return res.status(400).json({ message: 'FCM token is required.' });
    }

    try {
        await UserSettings.findOneAndUpdate(
            { userId: req.user._id },
            { fcmToken: fcmToken },
            { upsert: true } // Creates the setting if it doesn't exist
        );
        res.status(200).json({ message: 'FCM token updated successfully.' });
    } catch (error) {
        console.error('Error updating FCM token:', error);
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

module.exports = { updateFcmToken, updateBatteryStatus };