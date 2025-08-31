const CallLog = require('../models/CallLog');

function registerStatusRoute(app) {
    app.post('/api/twilio/status', async (req, res) => {
        try {
            const { CallSid, CallDuration, CallStatus } = req.body;
            console.log('📞 Call status update:', { CallSid, CallDuration, CallStatus });

            if (!CallSid) {
                return res.status(400).json({ message: 'Missing CallSid' });
            }

            const updateData = { 
                duration: CallDuration,
                status: CallStatus || 'completed'
            };
            
            // Set endTime for completed calls
            if (CallStatus === 'completed' || CallStatus === 'no-answer' || CallStatus === 'busy') {
                updateData.endTime = new Date();
            }

            const updatedCallLog = await CallLog.findOneAndUpdate(
                { callSid: CallSid },
                updateData,
                { new: true }
            );

            if (updatedCallLog) {
                console.log(`✅ Call status updated for ${CallSid}:`, updateData);
                res.status(200).json({ message: 'Call log updated successfully' });
            } else {
                console.warn(`❌ No CallLog found for callSid: ${CallSid}`);
                res.status(404).json({ message: 'Call log not found' });
            }

        } catch (err) {
            console.error('Error updating call duration:', err);
            res.status(500).json({ message: 'Error updating call log', error: err.message });
        }
    });
}

module.exports = { registerStatusRoute };