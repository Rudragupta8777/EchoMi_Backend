const express = require('express');
const router = express.Router();
const { getLatestSmsByCall, storeCallSms, triggerSmsFetch } = require('../controllers/smsController');
const { protect } = require('../middleware/authMiddleware'); // Make sure you import your auth middleware

// Route for AI model to fetch latest SMS for a call
router.post('/call/latest', getLatestSmsByCall);

// Route for mobile app to store SMS when call starts
// ADD THE 'protect' MIDDLEWARE HERE
router.post('/call/store', protect, storeCallSms);

// Route to trigger SMS fetch from mobile app
router.post('/call/trigger-fetch', triggerSmsFetch);

router.get('/call/test', (req, res) => {
    res.json({ message: 'SMS endpoint is working!', timestamp: new Date() });
});

module.exports = router;