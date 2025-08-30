const express = require('express');
const router = express.Router();
const { updateFcmToken } = require('../controllers/userSettingsController');
const { protect } = require('../middleware/authMiddleware');

router.route('/fcm-token').put(protect, updateFcmToken);

module.exports = router;