const Prompt = require('../models/Prompt');

// ... (keep the createPrompt function)

// @desc    Get all prompts for a user
// @route   GET /api/prompts
// @access  Private
const getPrompts = async (req, res) => {
    try {
        const prompts = await Prompt.find({ userId: req.user._id });
        res.json(prompts);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update a prompt
// @route   PUT /api/prompts/:promptType
// @access  Private
const updatePrompt = async (req, res) => {
    const { instructions } = req.body;
    const { promptType } = req.params;

    try {
        const prompt = await Prompt.findOneAndUpdate(
            { userId: req.user._id, promptType: promptType },
            { instructions: instructions },
            { new: true, upsert: true } // Upsert will create it if it doesn't exist
        );
        res.json(prompt);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { getPrompts, updatePrompt /*, createPrompt */ };