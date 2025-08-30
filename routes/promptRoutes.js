const express = require('express');
const router = express.Router();
const { getPrompts, updatePrompt } = require('../controllers/promptController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').get(protect, getPrompts);
router.route('/:promptType').put(protect, updatePrompt);

module.exports = router;