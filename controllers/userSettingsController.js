const UserSettings = require('../models/UserSettings');

// @desc      Update User's FCM Token
// @route     PUT /api/settings/fcm-token
// @access    Private
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

module.exports = { updateFcmToken };