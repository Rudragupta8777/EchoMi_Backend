const CallLog = require('../models/CallLog');

function registerStatusRoute(app) {
    app.post('/api/twilio/status', async (req, res) => {
        try {
            const { CallSid, CallDuration } = req.body;

            if (!CallSid) {
                return res.status(400).json({ message: 'Missing CallSid' });
            }

            await CallLog.findOneAndUpdate(
                { callSid: CallSid },
                { duration: CallDuration },
                { new: true }
            );

            res.sendStatus(200);
        } catch (err) {
            console.error('Error updating call duration:', err);
            res.status(500).json({ message: 'Error updating call log' });
        }
    });
}

module.exports = { registerStatusRoute };
