require("dotenv").config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const connectDB = require("./config/db");

// Import handlers
const {
  handleWebSocketConnection,
  registerStatusRoute,
} = require("./controllers/twilioController");

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// API Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/prompts", require("./routes/promptRoutes"));
app.use("/api/twilio", require("./routes/twilioRoutes"));
app.use("/api/contacts", require("./routes/contactRoutes"));
app.use("/api/logs", require("./routes/callLogRoutes"));
app.use("/api/settings", require("./routes/userSettingsRoutes"));
app.use("/api/sms", require("./routes/smsRoutes"));
app.use("/api/otp", require("./routes/otpRoutes"));
app.use("/api/summary", require("./routes/summaryRoutes"));

// Register Twilio status callback route (this is handled in the controller now)
registerStatusRoute(app);

// Add notification endpoint for AI model
app.post("/api/send-notification", (req, res) => {
  try {
    console.log("📱 [NOTIFICATION] Received from AI model:", req.body);

    // Extract notification data
    const {
      user_phone,
      title,
      message,
      type,
      approval_token,
      action_required,
      timestamp,
    } = req.body;

    // Log the notification for now (you can implement actual notification logic later)
    console.log("✅ [NOTIFICATION] Processing:", {
      user_phone,
      title: title?.substring(0, 50) + "...",
      type,
      action_required,
      timestamp,
    });

    // Respond with success
    res.status(200).json({
      success: true,
      message: "Notification received and processed",
      approval_token,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ [NOTIFICATION] Error processing notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process notification",
    });
  }
});

// Health check route
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "AI Assistant Backend is running!",
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Handle WebSocket connections
wss.on("connection", handleWebSocketConnection);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server is listening on the same port`);
  console.log(`🌐 Health check: http://localhost:${PORT}/`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down gracefully...");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
});
