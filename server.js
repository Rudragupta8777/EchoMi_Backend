const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
// We only need the one handler function now
const { handleWebSocketConnection } = require('./controllers/twilioController');

// Import the status route registration
const { registerStatusRoute } = require('./routes/twilioStatusRoute');

dotenv.config();
connectDB(); // Keeping DB connection for other potential API routes

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// API Routes - you can keep these for your app's control panel
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/prompts', require('./routes/promptRoutes'));
app.use('/api/twilio', require('./routes/twilioRoutes')); // This handles the initial call
app.use('/api/contacts', require('./routes/contactRoutes'));
app.use('/api/logs', require('./routes/callLogRoutes'));
app.use('/api/settings', require('./routes/userSettingsRoutes'));

// Register Twilio status callback route
registerStatusRoute(app);

app.get('/', (req, res) => {
    res.send('AI Assistant Backend is running!');
});

const PORT = process.env.PORT || 5000;

// Create the HTTP server from the Express app
const server = http.createServer(app);

// Attach the WebSocket server directly to the HTTP server
const wss = new WebSocket.Server({ server });

// When a WebSocket connection is made, pass it to our handler
wss.on('connection', handleWebSocketConnection);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server is listening on the same port.`);
});
