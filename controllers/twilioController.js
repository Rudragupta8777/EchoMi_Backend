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
const { translateText } = require('../services/translationService');

// Role prompts
const rolePrompts = {
  delivery: "You are an AI assistant for handling a delivery...",
  family: "You are an AI assistant for speaking with a family member...",
  unknown: "You are an AI assistant for speaking with an unknown caller..."
};

const saveTranscriptToMongo = async (callSid, newMessage, role) => {
    if (!callSid) {
        console.error('❌ Cannot save transcript: callSid is null or undefined.');
        return;
    }
    try {
        const result = await CallLog.findOneAndUpdate(
            { callSid },
            {
                $push: {
                    transcript: {
                        speaker: role === 'user' ? 'caller' : 'ai',
                        text: newMessage,
                        timestamp: new Date()
                    }
                }
            },
            { new: true }
        );
        
        if (result) {
            console.log('✅ Transcript saved to MongoDB for callSid:', callSid);
        } else {
            console.error('❌ No CallLog found with callSid:', callSid);
        }
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
      startTime: new Date()
    });
    await callLog.save();
    console.log('CallLog created:', callLog);

    // Twilio greeting
    twiml.say(
      { voice: 'alice', rate: '0.9' },
      `Hello, please wait a moment while I connect you to ${user.name}'s AI assistant.`
    );

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

  const conversationState = {
    sttService: null,
    chatHistory: [],
    callerRole: null,
    streamSid: null,
    isProcessingResponse: false,
    responseQueue: [],
    hasGreeted: false,
    conversation_stage: 'start',
    language: undefined,
    callSid: null,
    user: null,
    callLog: null,
  };

  // Fetch user and call data using callSid
  const initializeCallData = async (callSid) => {
    try {
      console.log('🔍 Looking up call data for callSid:', callSid);
      
      const callLog = await CallLog.findOne({ callSid });
      if (!callLog) {
        console.error('❌ No CallLog found for callSid:', callSid);
        return false;
      }
      
      const user = await User.findById(callLog.userId);
      if (!user) {
        console.error('❌ No User found for userId:', callLog.userId);
        return false;
      }
      
      conversationState.callSid = callSid;
      conversationState.callLog = callLog;
      conversationState.user = user;
      
      console.log('✅ Call data initialized:', {
        callSid,
        userId: user._id,
        userName: user.name
      });
      
      return true;
    } catch (error) {
      console.error('Error initializing call data:', error);
      return false;
    }
  };
    
  // Fetch user's name dynamically
  const getUserName = async () => {
    try {
      if (conversationState.user?.name) {
        return conversationState.user.name;
      }
      return 'Assistant'; // fallback
    } catch (err) {
      console.error('Error fetching user name:', err);
      return 'Assistant';
    }
  };

  // Safe send audio response function
  const safeSendAudioResponse = async (text, lang = 'en') => {
    try {
      await sendAudioResponse(text, lang);
    } catch (error) {
      console.error('Error in safeSendAudioResponse:', error);
    }
  };

  // Send audio to Twilio
  const sendAudioResponse = async (text, lang = 'en') => {
    if (!text || !conversationState.streamSid) return;
    try {
      let voiceLang = lang === 'hi' ? 'hi-IN' : lang;
      const audio = await textToSpeech(text, voiceLang);
      if (audio) {
        ws.send(JSON.stringify({
          event: 'media',
          streamSid: conversationState.streamSid,
          media: { payload: audio }
        }));
      }
    } catch (err) {
      console.error('Error sending audio:', err);
    }
  };

  // Queue TTS messages safely
  const enqueueTTS = async (text, lang = 'en') => {
    if (!text) return;
    await sendAudioResponse(text, lang);
  };

  // Initial greeting
  const sendInitialGreeting = async () => {
    if (conversationState.hasGreeted) return;
    conversationState.hasGreeted = true;

    const userName = await getUserName();
    const greeting = `Hi! This is ${userName}'s AI assistant. How can I help you today?`;
    await enqueueTTS(greeting, 'en');
  };

  // Emergency detection
  const checkForEmergency = async (transcript) => {
    const lowered = transcript.toLowerCase();
    const emergencyKeywords = ["urgent", "emergency", "asap", "911", "accident", "danger"];
    
    const isEmergency = emergencyKeywords.some(keyword => lowered.includes(keyword));
    
    if (isEmergency) {
      console.log("🚨 EMERGENCY DETECTED in transcript:", transcript);
      
      if (!conversationState.user) {
        console.error("❌ Cannot send emergency alert: No user data available");
        return;
      }
      
      try {
        const userSettings = await UserSettings.findOne({ 
          userId: conversationState.user._id 
        });
        
        console.log('🔍 Emergency check - User ID:', conversationState.user._id);
        console.log('🔍 UserSettings found:', userSettings ? 'Yes' : 'No');
        console.log('🔍 FCM Token available:', userSettings?.fcmToken ? 'Yes' : 'No');
        
        if (userSettings?.fcmToken) {
          console.log('📱 Sending emergency notification to FCM token:', userSettings.fcmToken);
          
          const notificationData = {
            title: "🚨 URGENT CALL ALERT",
            body: `Emergency detected in call from ${conversationState.callLog.callerNumber}: "${transcript}"`,
            priority: "high",
            callSid: conversationState.callSid,
            callerNumber: conversationState.callLog.callerNumber,
            timestamp: new Date().toISOString()
          };
          
          const notificationResult = await sendEmergencyAlert(
            userSettings.fcmToken, 
            notificationData
          );
          
          console.log("✅ Emergency notification sent successfully:", notificationResult);
          await safeSendAudioResponse("I understand this is an emergency. I have immediately notified the person and help is on the way.");
          
        } else {
          console.warn("⚠️ No FCM token found for user. Cannot send push notification.");
          await safeSendAudioResponse("I understand this is an emergency. Let me try to reach them immediately.");
        }
      } catch (err) {
        console.error("❌ FAILED to send emergency alert:", err);
        await safeSendAudioResponse("I understand this is urgent. I'm here to help you.");
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

  // Detect caller role
  const detectCallerRole = (transcript) => {
    const text = transcript.toLowerCase();
    if (text.includes('delivery') || text.includes('package') || text.includes('courier')) return 'delivery';
    if (text.includes('mom') || text.includes('dad') || text.includes('family') || text.includes('brother') || text.includes('sister')) return 'family';
    return 'unknown';
  };

  // Generate AI response
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

  // Process response queue
  const processResponseQueue = async () => {
    if (conversationState.isProcessingResponse || conversationState.responseQueue.length === 0) return;
    conversationState.isProcessingResponse = true;

    const transcript = conversationState.responseQueue.shift();
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
        if (conversationState.callSid) {
          await saveTranscriptToMongo(conversationState.callSid, transcript, 'user');
          if (aiResponse.response_text) {
            await saveTranscriptToMongo(conversationState.callSid, aiResponse.response_text, 'ai');
          }
        } else {
          console.error('❌ Cannot save transcript: callSid not available in conversation state');
        }

        // 7️⃣ Hang up logic if end_of_call
        if (aiResponse.stage === 'end_of_call') {
          console.log('[AI] Stage reached: end_of_call → Hanging up call.');

          if (conversationState.callSid) {
            await CallLog.findOneAndUpdate(
              { callSid: conversationState.callSid },
              {
                status: 'completed',
                endTime: new Date(),
                conversationHistory: conversationState.chatHistory
              }
            );
          }

          ws.send(JSON.stringify({ action: 'hangup' }));
          setTimeout(() => ws.close(), 5000);
        }
      }

    } catch (error) {
      console.error('Error processing response:', error);
      await safeSendAudioResponse("Sorry, I'm having a little trouble right now. Could you repeat that?");
    } finally {
      setTimeout(() => { conversationState.isProcessingResponse = false; }, 500);
    }
  };

  // WebSocket event handlers
  ws.on('message', async (message) => {
    const msg = JSON.parse(message);
    
    switch (msg.event) {
      case 'connected':
        console.log('Twilio media stream connected');
        break;
      case 'start':
        console.log('📞 Twilio start message received:', {
          streamSid: msg.start.streamSid,
          callSid: msg.start.callSid
        });
        
        conversationState.streamSid = msg.start.streamSid;
        conversationState.sttService = new SttService();
        conversationState.sttService.on('speech_transcribed', onTranscript);
        
        if (msg.start.callSid) {
          const initialized = await initializeCallData(msg.start.callSid);
          if (!initialized) {
            console.error('❌ Failed to initialize call data');
          }
        } else {
          console.error('❌ No callSid in Twilio start message');
        }
        
        setTimeout(sendInitialGreeting, 1000);
        break;
      case 'media':
        if (conversationState.sttService) {
          conversationState.sttService.sendAudio(msg.media.payload);
        }
        break;
      case 'stop':
        console.log('📞 Twilio stop message received');
        cleanup();
        break;
    }
  });

  const cleanup = () => {
    if (conversationState.sttService) conversationState.sttService.close();
    conversationState.sttService = null;
    conversationState.responseQueue = [];
    conversationState.isProcessingResponse = false;
    conversationState.callSid = null;
    conversationState.user = null;
    conversationState.callLog = null;
  };

  ws.on('close', cleanup);
  ws.on('error', (err) => { 
    console.error('WebSocket error:', err); 
    cleanup(); 
  });
};

async function saveConversationSummary(summaryData) {
    // Example for MongoDB with Mongoose
    const ConversationSummary = require('../models/ConversationSummary');
    
    try {
        const summary = new ConversationSummary({
            firebaseUid: summaryData.firebaseUid,
            callId: summaryData.callId,
            summary: summaryData.summary,
            callDetails: summaryData.call_details,
            conversationLength: summaryData.conversation_length,
            callDuration: summaryData.call_duration,
            timestamp: new Date(summaryData.timestamp),
            callerRole: summaryData.caller_role || 'unknown'
        });
        
        await summary.save();
        console.log('✅ Conversation summary saved to database');
        return summary;
    } catch (error) {
        console.error('❌ Error saving conversation summary:', error);
        throw error;
    }
}

router.post('/generate-summary', async (req, res) => {
    try {
        const {
            firebaseUid,
            callId,
            conversationHistory,
            collectedInfo,
            callDuration,
            callerRole
        } = req.body;

        // Validate required fields
        if (!conversationHistory || !Array.isArray(conversationHistory)) {
            return res.status(400).json({
                success: false,
                error: 'conversationHistory is required and must be an array'
            });
        }

        // Call Python API to generate summary
        const pythonResponse = await axios.post(
            `${PYTHON_API_URL}/api/conversation-summary`,
            {
                history: conversationHistory,
                collected_info: collectedInfo,
                call_duration: callDuration
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${INTERNAL_API_KEY}`
                },
                timeout: 10000
            }
        );

        if (!pythonResponse.data.success) {
            return res.status(500).json({
                success: false,
                error: 'Failed to generate summary from Python API',
                details: pythonResponse.data.error
            });
        }

        const summaryData = {
            ...pythonResponse.data,
            firebaseUid,
            callId,
            caller_role: callerRole
        };

        // Save to database
        const savedSummary = await saveConversationSummary(summaryData);

        // Send response to Android app
        res.json({
            success: true,
            summary: pythonResponse.data.summary,
            callDetails: pythonResponse.data.call_details,
            conversationLength: pythonResponse.data.conversation_length,
            callDuration: callDuration,
            summaryId: savedSummary._id,
            timestamp: pythonResponse.data.timestamp
        });

    } catch (error) {
        console.error('❌ Error generating conversation summary:', error);
        
        if (error.code === 'ECONNREFUSED') {
            return res.status(503).json({
                success: false,
                error: 'Python API is not available'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});
router.get('/summaries/:firebaseUid', async (req, res) => {
    try {
        const { firebaseUid } = req.params;
        const { limit = 20, offset = 0, callerRole } = req.query;

        // Build query
        const query = { firebaseUid };
        if (callerRole) {
            query.callerRole = callerRole;
        }

        const ConversationSummary = require('../models/ConversationSummary');
        
        const summaries = await ConversationSummary
            .find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(offset))
            .lean();

        const totalCount = await ConversationSummary.countDocuments(query);

        res.json({
            success: true,
            summaries,
            pagination: {
                total: totalCount,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: (parseInt(offset) + parseInt(limit)) < totalCount
            }
        });

    } catch (error) {
        console.error('❌ Error fetching conversation summaries:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch conversation summaries'
        });
    }
});

/**
 * Auto-generate summary when call ends
 * This can be called from your existing call handling logic
 */
async function autoGenerateSummary(callData) {
    try {
        const {
            firebaseUid,
            callId,
            conversationHistory,
            collectedInfo,
            callDuration,
            callerRole
        } = callData;

        console.log(`🔄 Auto-generating summary for call ${callId}`);

        const response = await axios.post(
            `${PYTHON_API_URL}/api/conversation-summary`,
            {
                history: conversationHistory,
                collected_info: collectedInfo,
                call_duration: callDuration
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${INTERNAL_API_KEY}`
                },
                timeout: 10000
            }
        );

        if (response.data.success) {
            const summaryData = {
                ...response.data,
                firebaseUid,
                callId,
                caller_role: callerRole
            };

            await saveConversationSummary(summaryData);
            console.log(`✅ Auto-summary generated for call ${callId}`);
            
            return response.data.summary;
        } else {
            console.error('❌ Failed to auto-generate summary:', response.data.error);
            return null;
        }

    } catch (error) {
        console.error('❌ Error in auto-generate summary:', error);
        return null;
    }
}

// Export the router and helper function
module.exports = { router, autoGenerateSummary };

// ==========================================
// DATABASE MODEL EXAMPLE (MongoDB/Mongoose)
// File: models/ConversationSummary.js
// ==========================================

const mongoose = require('mongoose');

const conversationSummarySchema = new mongoose.Schema({
    firebaseUid: {
        type: String,
        required: true,
        index: true
    },
    callId: {
        type: String,
        required: true,
        unique: true
    },
    summary: {
        type: String,
        required: true,
        maxlength: 500
    },
    callDetails: {
        company: String,
        caller_name: String,
        final_stage: String,
        otp_provided: Boolean
    },
    conversationLength: {
        type: Number,
        min: 0
    },
    callDuration: {
        type: Number, // in seconds
        min: 0
    },
    callerRole: {
        type: String,
        enum: ['delivery', 'unknown', 'urgent'],
        default: 'unknown'
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Create indexes for better query performance
conversationSummarySchema.index({ firebaseUid: 1, timestamp: -1 });
conversationSummarySchema.index({ firebaseUid: 1, callerRole: 1 });

module.exports = mongoose.model('ConversationSummary', conversationSummarySchema);

// Status route to update call duration
const registerStatusRoute = (app) => {
  app.post('/api/twilio/status', async (req, res) => {
    try {
      const { CallSid, CallDuration, CallStatus } = req.body;
      console.log('📞 Call status update:', { CallSid, CallDuration, CallStatus });
      
      const updateData = { 
        duration: CallDuration,
        status: CallStatus || 'completed'
      };
      
      if (CallStatus === 'completed' || CallStatus === 'no-answer' || CallStatus === 'busy') {
        updateData.endTime = new Date();
      }

      const updatedCallLog = await CallLog.findOneAndUpdate(
        { callSid: CallSid },
        updateData,
        { new: true }
      );

      if (updatedCallLog) {
        console.log(`✅ Call status updated for ${CallSid}:`, updateData);
      } else {
        console.warn(`❌ No CallLog found for callSid: ${CallSid}`);
      }

      res.sendStatus(200);
    } catch (error) {
      console.error('Error updating call status:', error);
      res.sendStatus(500);
    }
  });
};

// Handle sending manual notifications (if needed)
const handleSendNotification = async (req, res) => {
  try {
    const { userId, message, priority = 'normal' } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ error: 'userId and message are required' });
    }

    // Find user settings for FCM token
    const userSettings = await UserSettings.findOne({ userId });
    
    if (!userSettings?.fcmToken) {
      return res.status(404).json({ error: 'No FCM token found for user' });
    }

    const notificationData = {
      title: "Message from AI Assistant",
      body: message,
      priority: priority,
      timestamp: new Date().toISOString()
    };

    const result = await sendEmergencyAlert(userSettings.fcmToken, notificationData);
    
    res.status(200).json({ 
      success: true, 
      message: 'Notification sent successfully',
      result 
    });

  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
};

module.exports = { 
  handleIncomingCall, 
  handleWebSocketConnection, 
  registerStatusRoute,
  handleSendNotification
};