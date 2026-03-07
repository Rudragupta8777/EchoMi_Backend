const User = require("../models/User");
const UserSettings = require("../models/UserSettings");
const Prompt = require("../models/Prompt");

const registerOrLoginUser = async (req, res) => {
  const { email, name, firebaseUid } = req.body;

  if (!email || !name || !firebaseUid) {
    return res
      .status(400)
      .json({ message: "Please provide email, name, and firebaseUid" });
  }

  try {
    let user = await User.findOne({ firebaseUid });

    if (user) {
      const needsDeliveryLocation =
        !user.deliveryLocation ||
        !user.deliveryLocation.latitude ||
        !user.deliveryLocation.longitude;

      res.status(200).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        needsDeliveryLocation: needsDeliveryLocation,
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
        {
          userId: user._id,
          promptType: "unknown",
          instructions:
            "You are a helpful AI assistant for a user who is unavailable. Introduce yourself as their AI assistant and ask how you can help. Be polite and concise.",
        },
        {
          userId: user._id,
          promptType: "family",
          instructions:
            "You are a friendly AI assistant speaking to a family member or friend of the user. Be warm and conversational. Ask to take a message for them.",
        },
        {
          userId: user._id,
          promptType: "delivery",
          instructions:
            "You are an efficient AI assistant handling a package delivery. Ask for the tracking number and where to leave the package. Provide clear instructions.",
        },
      ];
      await Prompt.insertMany(defaultPrompts);

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        needsDeliveryLocation: true,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

const setDeliveryLocation = async (req, res) => {
  const { latitude, longitude } = req.body;
  const userId = req.user._id; // Assuming authMiddleware sets req.user

  if (!latitude || !longitude) {
    return res
      .status(400)
      .json({ message: "Please provide latitude and longitude" });
  }

  // Validate latitude and longitude ranges
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res
      .status(400)
      .json({ message: "Invalid latitude or longitude values" });
  }

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      {
        deliveryLocation: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        },
      },
      { new: true },
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Delivery location set successfully",
      deliveryLocation: user.deliveryLocation,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = { registerOrLoginUser, setDeliveryLocation };
