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
  try {
    await CallLog.findOneAndUpdate(
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
    language: undefined
  };

  // Fetch user name
  const getUserName = async () => {
    try {
      const user = await User.findOne({ twilioPhoneNumber: twilioToNumber });
      return (user && user.name) ? user.name : 'Ruchit';
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
    await enqueueTTS(greeting, 'en');
  };

  // Detect emergencies
  const checkForEmergency = async (text) => {
    if (!text) return;
    const lowered = text.toLowerCase();
    if (lowered.includes('urgent') || lowered.includes('emergency') || lowered.includes('asap')) {
      console.log('🚨 Emergency detected in transcript!');
      try {
        await sendEmergencyAlert({
          title: '🚨 Urgent Call Alert',
          body: `Urgent situation detected from caller: "${text}"`,
          priority: 'high'
        });
        await enqueueTTS('I understand this is urgent. I am notifying you immediately.', conversationState.language || 'en');
      } catch (err) {
        console.error('❌ Failed to send emergency alert:', err);
      }
    }
  };

  // Detect caller role
  const detectCallerRole = (text) => {
    const lower = (text || '').toLowerCase();
    if (lower.includes('delivery') || lower.includes('package') || lower.includes('courier')) return 'delivery';
    if (lower.includes('mom') || lower.includes('dad') || lower.includes('family') || lower.includes('brother') || lower.includes('sister')) return 'family';
    return 'unknown';
  };

  // STT transcript handler
  const onTranscript = async (transcriptObj) => {
    const text = typeof transcriptObj === 'string' ? transcriptObj : (transcriptObj?.text || '');
    console.log(`[Caller Said]: ${text}`);

    if (!conversationState.language) {
      conversationState.language = transcriptObj?.detected_language
        ? transcriptObj.detected_language
        : /[\u0900-\u097F]/.test(text)
          ? 'hi'
          : 'en';
    }

    if (!text) return;

    conversationState.responseQueue.push(text);
    processResponseQueue();
  };

  // Process response queue
  const processResponseQueue = async () => {
    if (conversationState.isProcessingResponse || conversationState.responseQueue.length === 0) return;
    conversationState.isProcessingResponse = true;

    const transcript = conversationState.responseQueue.shift();
    conversationState.responseQueue = []; // clear queue to prevent overlap

    try {
      await checkForEmergency(transcript);

      // Translate caller to English for AI
      const englishText = await translateText(transcript, 'en', conversationState.language || 'auto');

      // Detect caller role
      if (!conversationState.callerRole) {
        conversationState.callerRole = detectCallerRole(englishText);
        console.log(`[System]: Identified role as '${conversationState.callerRole}'`);
      }

      // Call backend AI
      const aiResponse = await generateAIResponse(englishText);

      if (aiResponse?.response_text) {
        const targetLang = conversationState.language || 'en';
        const localizedReply = targetLang !== 'en'
          ? await translateText(aiResponse.response_text, targetLang, 'en')
          : aiResponse.response_text;

        // Send AI response via TTS
        await enqueueTTS(localizedReply, targetLang);

        // Save transcripts
        await saveTranscriptToMongo(callSid, transcript, 'user');
        await saveTranscriptToMongo(callSid, localizedReply, 'ai');
      }

      // Update conversation state
      if (aiResponse) {
        conversationState.chatHistory = aiResponse.updated_history || conversationState.chatHistory;
        conversationState.conversation_stage = aiResponse.stage || conversationState.conversation_stage;
        console.log(`[CONVERSATION] Intent: ${aiResponse.intent}, Stage: ${aiResponse.stage}`);

        if (aiResponse.stage === 'end_of_call') {
          console.log('[AI] End of call reached. Hanging up.');
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

    } catch (err) {
      console.error('Error processing response:', err);
      await enqueueTTS("Sorry, I'm having a little trouble right now.", conversationState.language || 'en');
    } finally {
      conversationState.isProcessingResponse = false;
    }
  };

  // Backend AI call
  const generateAIResponse = async (englishText) => {
    try {
      const body = {
        caller_role: conversationState.callerRole,
        new_message: englishText,
        history: conversationState.chatHistory,
        conversation_stage: conversationState.conversation_stage
      };
      const res = await axios.post('http://localhost:5001/generate', body);
      return res.data;
    } catch (err) {
      console.error('[API ERROR]', err.response?.data || err.message);
      throw err;
    }
  };

  // Queue TTS messages safely
  const enqueueTTS = async (text, lang = 'en') => {
    if (!text) return;
    await sendAudioResponse(text, lang);
  };

  // Send audio to Twilio
  const sendAudioResponse = async (text, lang = 'en') => {
    if (!text || !conversationState.streamSid) return;
    try {
      let voiceLang = lang === 'hi' ? 'hi-IN' : lang; // map Hindi
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

  // WebSocket event handlers
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
        conversationState.sttService?.sendAudio(msg.media.payload);
        break;
      case 'stop':
        cleanup();
        break;
    }
  });

  ws.on('close', cleanup);
  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    cleanup();
  });

  function cleanup() {
    conversationState.sttService?.close();
    conversationState.sttService = null;
    conversationState.responseQueue = [];
    conversationState.isProcessingResponse = false;
  }
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

module.exports = { handleIncomingCall, handleWebSocketConnection, handleSendNotification };
