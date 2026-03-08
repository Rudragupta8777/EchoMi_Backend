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

const getDeliveryLocation = async (req, res) => {
  const userId = req.user._id;

  try {
    const user = await User.findById(userId).select(
      "deliveryLocation name email",
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (
      !user.deliveryLocation ||
      !user.deliveryLocation.latitude ||
      !user.deliveryLocation.longitude
    ) {
      return res.status(200).json({
        message: "No delivery location set",
        deliveryLocation: null,
      });
    }

    res.status(200).json({
      deliveryLocation: user.deliveryLocation,
      user: {
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

const updateDeliveryLocation = async (req, res) => {
  const { latitude, longitude, address } = req.body;
  const userId = req.user._id;

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
    const updateData = {
      deliveryLocation: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      },
    };

    // Add address if provided
    if (address) {
      updateData.deliveryLocation.address = address;
    }

    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Delivery location updated successfully",
      deliveryLocation: user.deliveryLocation,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  registerOrLoginUser,
  setDeliveryLocation,
  getDeliveryLocation,
  updateDeliveryLocation,
};
