const express = require('express');
const router = express.Router();
const { updateFcmToken, updateBatteryStatus } = require('../controllers/userSettingsController');
const { protect } = require('../middleware/authMiddleware');

router.route('/fcm-token').put(protect, updateFcmToken);
router.route('/battery-status').put(protect, updateBatteryStatus);

module.exports = router;
