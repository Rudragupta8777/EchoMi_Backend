// routes/userSettingsRoutes.js
const express = require('express');
const router = express.Router();
const { updateFcmToken, updateBatteryStatus, getFcmToken } = require('../controllers/userSettingsController');
const { protect } = require('../middleware/authMiddleware');

router.route('/fcm-token').put(protect, updateFcmToken);
router.route('/fcm-token').get(protect, getFcmToken); // Add this line
router.route('/battery-status').put(protect, updateBatteryStatus);

module.exports = router;