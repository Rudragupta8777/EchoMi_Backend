const axios = require('axios');
const twilio = require('twilio');
const SttService = require('../services/sttService');
const VoiceResponse = twilio.twiml.VoiceResponse;
const { textToSpeech } = require('../services/ttsService');
const User = require('../models/User');
const CallLog = require('../models/CallLog');
const UserSettings = require('../models/UserSettings');
const { sendEmergencyAlert } = require('../services/fcmService');
const url = require('url');

// Role prompts
const rolePrompts = {
    delivery: "You are an AI assistant for handling a delivery...",
    family: "You are an AI assistant for speaking with a family member...",
    unknown: "You are an AI assistant for speaking with an unknown caller..."
};

// Handle incoming Twilio call
const handleIncomingCall = async (req, res) => {
    try {
        const twiml = new VoiceResponse();

        // Get Twilio info
        const callSid = req.body.CallSid;
        const callerNumber = req.body.From;

        // Find user linked to Twilio number
        const user = await User.findOne({ twilioPhoneNumber: req.body.To });
        if (!user) return res.status(400).send('User not found for this Twilio number');

        // Create CallLog
        const callLog = new CallLog({
            userId: user._id,
            callerNumber,
            callSid,
            startTime: new Date(),
        });
        await callLog.save();
        console.log('CallLog created:', callLog);

        // Twilio greeting
        twiml.say({ voice: 'alice', rate: '0.9' }, 
            `Hello, please wait a moment while I connect you to ${user.name}'s AI assistant.`);

        const connect = twiml.connect();
        connect.stream({ url: `wss://${req.headers.host}/` });

        res.type('text/xml');
        res.send(twiml.toString());
    } catch (error) {
        console.error('Error handling Twilio call:', error);
        res.status(500).send('Server Error');
    }
};


// Handle WebSocket connection
const handleWebSocketConnection = (ws, req) => {
    console.log('New WebSocket connection established');

    const params = url.parse(req.url, true).query;
    const twilioToNumber = params.to;
    const callId = params.callSid;

    const conversationState = {
        sttService: null,
        chatHistory: [],
        callerRole: null,
        streamSid: null,
        isProcessingResponse: false,
        responseQueue: [],
        hasGreeted: false,
        conversation_stage: 'start',
        aiResponded: false,
    };

    // Fetch user's name dynamically from Firestore
    const getUserName = async () => {
        try {
            const user = await User.findOne({ twilioPhoneNumber: twilioToNumber });
            if (user && user.name) return user.name;
            return 'Ruchit'; // fallback
        } catch (err) {
            console.error('Error fetching user name:', err);
            return 'Ruchit';
        }
    };

    // Initial greeting
    const sendInitialGreeting = async () => {
        if (conversationState.hasGreeted) return;
        conversationState.hasGreeted = true;

        const userName = await getUserName();
        const greeting = `Hi! This is ${userName}'s AI assistant. How can I help you today?`;
        await safeSendAudioResponse(greeting);
    };

    // Detect emergency
    const checkForEmergency = async (transcript) => {
        const lowered = transcript.toLowerCase();
        if (lowered.includes("urgent") || lowered.includes("emergency") || lowered.includes("asap")) {
            console.log("🚨 Emergency detected in transcript!");
            try {
                await sendEmergencyAlert({
                    title: "🚨 Urgent Call Alert",
                    body: `Urgent situation detected from caller: "${transcript}"`,
                    priority: "high",
                });
                console.log("✅ Emergency notification sent.");
                await safeSendAudioResponse("I understand this is urgent. I am notifying you immediately.");
            } catch (err) {
                console.error("❌ Failed to send emergency alert:", err);
            }
        }
    };

    // Handle transcripts
    const onTranscript = async (transcript) => {
        console.log(`[Caller Said]: ${transcript}`);
        if (conversationState.isProcessingResponse) return;

        conversationState.responseQueue.push(transcript);
        await processResponseQueue();
    };

    // Process queue
    const processResponseQueue = async () => {
        if (conversationState.isProcessingResponse || conversationState.responseQueue.length === 0) return;
        conversationState.isProcessingResponse = true;

        const transcript = conversationState.responseQueue.pop();
        conversationState.responseQueue = [];

        try {
            await checkForEmergency(transcript);

            if (!conversationState.callerRole) {
                conversationState.callerRole = detectCallerRole(transcript);
                console.log(`[System]: Identified role as '${conversationState.callerRole}'`);
            }

            const aiResponse = await generateAIResponse(transcript);

            if (aiResponse) {
                await safeSendAudioResponse(aiResponse.response_text);
                conversationState.chatHistory = aiResponse.updated_history;
                conversationState.conversation_stage = aiResponse.stage;

                console.log(`[CONVERSATION] Intent: ${aiResponse.intent}, Stage: ${aiResponse.stage}`);

                // Hang up if end_of_call
                if (aiResponse.stage === 'end_of_call') {
                    console.log('[AI] Stage reached: end_of_call → Hanging up call.');

                    // Update call log
                    await CallLog.findOneAndUpdate({ callId }, {
                        status: 'completed',
                        endTime: new Date(),
                        conversationHistory: conversationState.chatHistory
                    });

                    ws.send(JSON.stringify({ action: 'hangup' }));
                    setTimeout(() => ws.close(), 5000);
                }
            }
        } catch (error) {
            console.error('Error processing response:', error);
            await safeSendAudioResponse("Sorry, I'm having a little trouble right now. Could you repeat that?");
        } finally {
            setTimeout(() => { conversationState.isProcessingResponse = false; }, 1000);
        }
    };

    const detectCallerRole = (transcript) => {
        const text = transcript.toLowerCase();
        if (text.includes('delivery') || text.includes('package') || text.includes('courier')) return 'delivery';
        if (text.includes('mom') || text.includes('dad') || text.includes('family') || text.includes('brother') || text.includes('sister')) return 'family';
        return 'unknown';
    };

    const generateAIResponse = async (transcript) => {
        try {
            const requestBody = {
                caller_role: conversationState.callerRole,
                new_message: transcript,
                history: conversationState.chatHistory,
                conversation_stage: conversationState.conversation_stage
            };
            const response = await axios.post('http://localhost:5001/generate', requestBody);
            return response.data;
        } catch (error) {
            console.error('[API ERROR] Backend request failed:', error.response?.data || error.message);
            throw error;
        }
    };

    const safeSendAudioResponse = async (text) => {
        if (conversationState.aiResponded) return;
        conversationState.aiResponded = true;
        await sendAudioResponse(text);
        setTimeout(() => { conversationState.aiResponded = false; }, 2000);
    };

    const sendAudioResponse = async (text) => {
        if (!text || !conversationState.streamSid) return;
        try {
            const audio = await textToSpeech(text);
            if (audio) {
                ws.send(JSON.stringify({ event: 'media', streamSid: conversationState.streamSid, media: { payload: audio } }));
            }
        } catch (error) {
            console.error('Error sending audio response:', error);
        }
    };

    // WebSocket events
    ws.on('message', (message) => {
        const msg = JSON.parse(message);
        switch (msg.event) {
            case 'connected':
                console.log('Twilio media stream connected');
                break;
            case 'start':
                conversationState.streamSid = msg.start.streamSid;
                conversationState.sttService = new SttService();
                conversationState.sttService.on('speech_transcribed', onTranscript);
                setTimeout(sendInitialGreeting, 1000);
                break;
            case 'media':
                if (conversationState.sttService) conversationState.sttService.sendAudio(msg.media.payload);
                break;
            case 'stop':
                cleanup();
                break;
        }
    });

    const cleanup = () => {
        if (conversationState.sttService) conversationState.sttService.close();
        conversationState.sttService = null;
        conversationState.responseQueue = [];
        conversationState.isProcessingResponse = false;
        conversationState.aiResponded = false;
    };

    ws.on('close', cleanup);
    ws.on('error', (err) => { console.error('WebSocket error:', err); cleanup(); });
};

module.exports = { handleIncomingCall, handleWebSocketConnection };
