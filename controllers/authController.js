const User = require('../models/User');
const UserSettings = require('../models/UserSettings');
const Prompt = require('../models/Prompt');

const registerOrLoginUser = async (req, res) => {
    const { email, name, firebaseUid } = req.body;

    if (!email || !name || !firebaseUid) {
        return res.status(400).json({ message: 'Please provide email, name, and firebaseUid' });
    }

    try {
        let user = await User.findOne({ firebaseUid });

        if (user) {
            res.status(200).json({
                _id: user._id,
                name: user.name,
                email: user.email,
            });
        } else {
            user = await User.create({
                email,
                name,
                firebaseUid,
                twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
            });

            await UserSettings.create({
                userId: user._id,
                fcmToken: null,
                lastKnownBatteryLevel: 100,
            });


            const defaultPrompts = [
                { userId: user._id, promptType: 'unknown', instructions: "You are a helpful AI assistant for a user who is unavailable. Introduce yourself as their AI assistant and ask how you can help. Be polite and concise." },
                { userId: user._id, promptType: 'family', instructions: "You are a friendly AI assistant speaking to a family member or friend of the user. Be warm and conversational. Ask to take a message for them." },
                { userId: user._id, promptType: 'delivery', instructions: "You are an efficient AI assistant handling a package delivery. Ask for the tracking number and where to leave the package. Provide clear instructions." },
            ];
            await Prompt.insertMany(defaultPrompts);

            res.status(201).json({
                _id: user._id,
                name: user.name,
                email: user.email,
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { registerOrLoginUser };