const express = require('express');
const router = express.Router();
const { registerOrLoginUser } = require('../controllers/authController');

router.post('/firebase', registerOrLoginUser);

module.exports = router;