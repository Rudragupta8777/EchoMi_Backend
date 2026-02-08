const mongoose = require("mongoose");

const SmsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    callSid: {
      type: String,
      required: true,
    },
    phoneNumber: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    sender: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
    },
    smsType: {
      type: String,
      enum: ["inbox", "sent"],
      default: "inbox",
    },
    storageType: {
      type: String,
      enum: ["regular", "emergency"],
      default: "regular",
    },
    isProcessed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Index for faster queries
SmsSchema.index({ userId: 1, callSid: 1, timestamp: -1 });
SmsSchema.index({ callSid: 1 });
SmsSchema.index({ storageType: 1, timestamp: -1 });

module.exports = mongoose.model("Sms", SmsSchema);
