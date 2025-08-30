const mongoose = require('mongoose');

const PromptSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    promptType: {
        type: String,
        enum: ['delivery', 'unknown', 'family'],
        required: true,
    },
    instructions: {
        type: String,
        required: true,
    },
});

module.exports = mongoose.model('Prompt', PromptSchema);