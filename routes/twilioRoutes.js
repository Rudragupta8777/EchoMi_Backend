const express = require('express');
const router = express.Router();
const { handleIncomingCall, handleSendNotification } = require('../controllers/twilioController');

// This is the webhook Twilio will call
router.post('/voice', handleIncomingCall);
router.post('/send-notification', handleSendNotification);

module.exports = router;