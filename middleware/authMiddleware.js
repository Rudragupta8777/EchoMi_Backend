const admin = require('firebase-admin');
const User = require('../models/User');

let serviceAccount;
const base64ServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
const jsonStringServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON; 

if (base64ServiceAccount) {
    try {
        const serviceAccountJson = Buffer.from(base64ServiceAccount, 'base64').toString('utf8');
        serviceAccount = JSON.parse(serviceAccountJson);
        console.log("✅ Firebase Service Account loaded from Base64 environment variable (Production).");
    } catch (e) {
        console.error('❌ FATAL: Failed to decode or parse Base64 variable:', e.message);
        process.exit(1); 
    }
} else if (jsonStringServiceAccount) {
    try {
        serviceAccount = JSON.parse(jsonStringServiceAccount);
        console.warn('⚠️ Firebase Service Account loaded from plain JSON string (Local Dev).');
    } catch (e) {
        console.error('❌ FATAL: Failed to parse plain JSON string variable:', e.message);
        process.exit(1); 
    }
} else {
    console.error('❌ FATAL: No Firebase Service Account credentials found in environment variables.');
    process.exit(1);
}

if (!admin.apps.length && serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
} else if (!serviceAccount) {
    console.error('❌ Initialization skipped: Service Account data is not available.');
}


if (!admin.apps.length && serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
} else if (!serviceAccount) {
    console.error('❌ Initialization skipped: Service Account data is not available.');
}


const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];

            const decodedToken = await admin.auth().verifyIdToken(token);
            
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