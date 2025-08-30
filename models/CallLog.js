const mongoose = require('mongoose');

const CallLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    callerNumber: {
        type: String,
        required: true,
    },
    callSid: {
        type: String,
        required: true,
        unique: true,
    },
    startTime: {
        type: Date,
        required: true,
    },
    duration: {
        type: Number,
        default: 0,
    },
    summary: {
        type: String,
    },
    recordingUrl: {
        type: String,
    },
    transcript: [{
        speaker: {
            type: String,
            enum: ['caller', 'ai'],
            required: true,
        },
        text: {
            type: String,
            required: true,
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
    }],
});

module.exports = mongoose.model('CallLog', CallLogSchema);