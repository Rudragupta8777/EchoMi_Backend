require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const connectDB = require('./config/db');

// Import handlers
const { handleWebSocketConnection, registerStatusRoute } = require('./controllers/twilioController');

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/prompts', require('./routes/promptRoutes'));
app.use('/api/twilio', require('./routes/twilioRoutes'));
app.use('/api/contacts', require('./routes/contactRoutes'));
app.use('/api/logs', require('./routes/callLogRoutes'));
app.use('/api/settings', require('./routes/userSettingsRoutes'));

// Register Twilio status callback route (this is handled in the controller now)
registerStatusRoute(app);

// Health check route
app.get('/', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'AI Assistant Backend is running!',
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Handle WebSocket connections
wss.on('connection', handleWebSocketConnection);

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 WebSocket server is listening on the same port`);
    console.log(`🌐 Health check: http://localhost:${PORT}/`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});