const express = require('express');
const router = express.Router();
const { saveContacts } = require('../controllers/contactController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').post(protect, saveContacts);

module.exports = router;