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


const saveTranscriptToMongo = async (callSid, newMessage, role) => {
    try {
        await CallLog.findOneAndUpdate(
            { callSid },  // match the existing call by callSid
            {
                $push: { 
                    transcript: { 
                        speaker: role === 'user' ? 'caller' : 'ai',
                        text: newMessage,
                        timestamp: new Date()
                    }
                }
            },
            { new: true } // do not upsert, only update existing call
        );
        console.log('✅ Transcript saved to MongoDB.');
    } catch (err) {
        console.error('❌ Failed to save transcript to MongoDB:', err);
    }
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
    const callSid = params.callSid;

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

       
    }

    // Process queue
const processResponseQueue = async () => {
    if (conversationState.isProcessingResponse || conversationState.responseQueue.length === 0) return;
    conversationState.isProcessingResponse = true;

    const transcript = conversationState.responseQueue.shift(); // get oldest transcript
    conversationState.responseQueue = [];

    try {
        // 1️⃣ Emergency Detection
        await checkForEmergency(transcript);

        // 2️⃣ Detect caller role if not set
        if (!conversationState.callerRole) {
            conversationState.callerRole = detectCallerRole(transcript);
            console.log(`[System]: Identified role as '${conversationState.callerRole}'`);
        }

        // 3️⃣ Generate AI response
        const aiResponse = await generateAIResponse(transcript);

        if (aiResponse) {
            // 4️⃣ Send AI audio response
            if (aiResponse.response_text) {
                await safeSendAudioResponse(aiResponse.response_text);
            }

            // 5️⃣ Update conversation state
            conversationState.chatHistory = aiResponse.updated_history || conversationState.chatHistory;
            conversationState.conversation_stage = aiResponse.stage || conversationState.conversation_stage;

            console.log(`[CONVERSATION] Intent: ${aiResponse.intent}, Stage: ${aiResponse.stage}`);

            // 6️⃣ Save transcripts to MongoDB
            await saveTranscriptToMongo(callSid, transcript, 'user');
            if (aiResponse.response_text) {
                await saveTranscriptToMongo(callSid, aiResponse.response_text, 'ai');
            }

            // 7️⃣ Hang up logic if end_of_call
            if (aiResponse.stage === 'end_of_call') {
                console.log('[AI] Stage reached: end_of_call → Hanging up call.');

                await CallLog.findOneAndUpdate(
                    { callSid },
                    {
                        status: 'completed',
                        endTime: new Date(),
                        conversationHistory: conversationState.chatHistory
                    }
                );

                ws.send(JSON.stringify({ action: 'hangup' }));
                setTimeout(() => ws.close(), 5000);
            }
        }

    } catch (error) {
        console.error('Error processing response:', error);
        await safeSendAudioResponse("Sorry, I'm having a little trouble right now. Could you repeat that?");
    } finally {
        // Slight delay before resetting the flag
        setTimeout(() => { conversationState.isProcessingResponse = false; }, 500);
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

const handleSendNotification = async (req, res) => {
    try {
        const { user_phone, title, message, type } = req.body;
        // Your logic to send a push notification...
        const result = await sendPushNotification({
            title,
            body: message,
            data: { type, approval_token: extractTokenFromMessage(message) }
        });
        res.json({ success: result });
    } catch (error) {
        console.error('Error sending notification:', error);
        res.status(500).json({ success: false, error: 'Failed to send notification' });
    }
};
module.exports = { handleIncomingCall, handleWebSocketConnection,  handleSendNotification };
