const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    phoneNumber: {
        type: String,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['family', 'default'], // The categories a user can assign
        required: true,
    },
});

// Create a compound index to prevent duplicate contacts for the same user
ContactSchema.index({ userId: 1, phoneNumber: 1 }, { unique: true });

module.exports = mongoose.model('Contact', ContactSchema);