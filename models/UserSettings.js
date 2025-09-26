const mongoose = require('mongoose');

const UserSettingsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
    },
    fcmToken: {
        type: String,
    },
    lastKnownBatteryLevel: {
        type: Number,
        default: 100,
    },
});

module.exports = mongoose.model('UserSettings', UserSettingsSchema);