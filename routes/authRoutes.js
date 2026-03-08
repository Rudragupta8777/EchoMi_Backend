const express = require("express");
const router = express.Router();
const {
  registerOrLoginUser,
  setDeliveryLocation,
  getDeliveryLocation,
  updateDeliveryLocation,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// Authentication
router.post("/firebase", registerOrLoginUser);

// Delivery location routes
router.post("/set-delivery-location", protect, setDeliveryLocation); // Initial setup
router.get("/delivery-location", protect, getDeliveryLocation); // Get current location
router.put("/delivery-location", protect, updateDeliveryLocation); // Update location

module.exports = router;
