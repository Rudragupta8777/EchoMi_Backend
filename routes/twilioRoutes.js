const express = require('express');
const router = express.Router();

// Import both functions that exist in the controller
const { handleIncomingCall, handleSendNotification } = require('../controllers/twilioController');

// This is the webhook Twilio will call
router.post('/voice', handleIncomingCall);
router.post('/send-notification', handleSendNotification);

// Test route to verify the route is working
router.get('/test', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Twilio routes are working',
    timestamp: new Date().toISOString()
  });
});

// Health check route
router.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Twilio service is running' });
});

module.exports = router;