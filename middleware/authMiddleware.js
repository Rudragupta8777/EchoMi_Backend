const admin = require('firebase-admin');
const serviceAccount = require('../config/firebase-service-account.json');
const User = require('../models/User');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      // Find the user in your DB using the Firebase UID
      req.user = await User.findOne({ firebaseUid: decodedToken.uid }).select('-__v');

      if (!req.user) {
          return res.status(401).json({ message: 'Not authorized, user not found in DB' });
      }

      next();
    } catch (error) {
      console.error('Token verification failed:', error);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

module.exports = { protect };