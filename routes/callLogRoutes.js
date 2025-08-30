const express = require('express');
const router = express.Router();
const { getCallLogs, getCallLogById } = require('../controllers/callLogController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').get(protect, getCallLogs);
router.route('/:id').get(protect, getCallLogById);

module.exports = router;