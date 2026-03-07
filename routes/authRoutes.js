const express = require("express");
const router = express.Router();
const {
  registerOrLoginUser,
  setDeliveryLocation,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

router.post("/firebase", registerOrLoginUser);
router.post("/set-delivery-location", protect, setDeliveryLocation);

module.exports = router;
