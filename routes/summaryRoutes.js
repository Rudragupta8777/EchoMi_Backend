const express = require("express");
const {
  getCallSummary,
  generateCallSummary,
  getUserCallSummaries,
  generateMissingSummaries,
} = require("../controllers/summaryController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Get summary for a specific call
router.get("/call/:callSid", protect, getCallSummary);

// Generate summary for a specific call (manual trigger)
router.post("/generate/:callSid", protect, generateCallSummary);

// Get all calls with summaries for a user
router.get("/user/:userId", protect, getUserCallSummaries);

// Bulk generate summaries for missing calls
router.post("/generate-missing", protect, generateMissingSummaries);

module.exports = router;
