const CallLog = require('../models/CallLog');

// @desc    Get all call logs for a user
// @route   GET /api/logs
// @access  Private
const getCallLogs = async (req, res) => {
    try {
        const logs = await CallLog.find({ userId: req.user._id }).sort({ startTime: -1 });
        res.json(logs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get a single call log by its ID
// @route   GET /api/logs/:id
// @access  Private
const getCallLogById = async (req, res) => {
    try {
        const log = await CallLog.findOne({ _id: req.params.id, userId: req.user._id });
        if (log) {
            res.json(log);
        } else {
            res.status(404).json({ message: 'Call log not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { getCallLogs, getCallLogById };