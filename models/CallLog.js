const mongoose = require("mongoose");

// Get current time in Indian Standard Time (IST, UTC+5:30)
const getISTTime = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
  return new Date(now.getTime() + istOffset);
};

const CallLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  callerNumber: {
    type: String,
    required: true,
  },
  callSid: {
    type: String,
    required: true,
    unique: true,
  },
  startTime: {
    type: Date,
    required: true,
  },
  duration: {
    type: Number,
    default: 0,
  },
  summary: {
    type: String,
  },
  summaryGeneratedAt: {
    type: Date,
  },
  summaryError: {
    type: String,
  },
  summaryAttemptedAt: {
    type: Date,
  },
  recordingUrl: {
    type: String,
  },
  transcript: [
    {
      speaker: {
        type: String,
        enum: ["caller", "ai"],
        required: true,
      },
      text: {
        type: String,
        required: true,
      },
      timestamp: {
        type: Date,
        default: getISTTime,
      },
    },
  ],
});

module.exports = mongoose.model("CallLog", CallLogSchema);
