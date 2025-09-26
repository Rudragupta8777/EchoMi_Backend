const express = require('express');
const router = express.Router();
const { registerOrLoginUser } = require('../controllers/authController');

// This single route handles both registration and login
router.post('/firebase', registerOrLoginUser);

module.exports = router;