const axios = require('axios');
const twilio = require('twilio');
const SttService = require('../services/sttService');
const VoiceResponse = twilio.twiml.VoiceResponse;
const { textToSpeech } = require('../services/ttsService');
const User = require('../models/User');
const CallLog = require('../models/CallLog');
const UserSettings = require('../models/UserSettings');
const { sendEmergencyAlert, sendSmsFetchRequest } = require('../services/fcmService');
const smsVerificationService = require('../services/smsVerificationService');
const conversationManager = require('../services/conversationManager');
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

// Add this function to handle SMS fetching when call starts
// Replace the existing triggerSmsFetchForCall function with this enhanced version
const triggerSmsFetchForCall = async (userId, callSid, storageType = 'regular') => {
    try {
        console.log(`📱 Triggering SMS fetch for call ${callSid}, user ${userId}, type: ${storageType}`);
        
        // Get user's FCM token
        const userSettings = await UserSettings.findOne({ userId });
        if (!userSettings?.fcmToken) {
            console.error('❌ No FCM token found for user:', userId);
            return false;
        }

        // Ensure all values are properly converted to strings
        await sendSmsFetchRequest(userSettings.fcmToken, {
            callSid: callSid.toString(),
            userId: userId.toString(), // Convert ObjectId to string
            storageType: storageType.toString(),
            limit: 20 // This will be converted to string in the service
        });

        console.log(`✅ SMS fetch FCM sent for call ${callSid}`);
        return true;
        
    } catch (error) {
        console.error('❌ Error triggering SMS fetch:', error);
        return false;
    }
};

// Handle incoming Twilio call
// Update the handleIncomingCall function to trigger REGULAR SMS fetch
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

    // 🔥 Trigger REGULAR SMS fetch from mobile app
    triggerSmsFetchForCall(user._id, callSid, 'regular');

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
    current_intent: null,
    collected_info: {}, // Store AI collected information
    found_otp: null, // Store OTP found in SMS
    approval_id: null, // Store approval request ID
    language: undefined,
    callSid: null,
    user: null,
    callLog: null,
    ws: ws, // Store the WebSocket connection
    startTime: Date.now(), // Track conversation start time
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
  const safeSendAudioResponse = async (text, lang = null) => {
    try {
      // Use provided language or fall back to conversation state language or default to 'en'
      const responseLanguage = lang || conversationState.language || 'en';
      
      // Format OTP for proper pronunciation before sending to TTS
      const formattedText = formatOtpForSpeech(text);
      
      console.log(`[TTS] Sending response in ${responseLanguage}: "${formattedText}"`);
      await sendAudioResponse(formattedText, responseLanguage);
    } catch (error) {
      console.error('Error in safeSendAudioResponse:', error);
    }
  };

  // Add safeSendAudioResponse to conversation state for use by resume service
  conversationState.safeSendAudioResponse = safeSendAudioResponse;

  // Send audio to Twilio
  const sendAudioResponse = async (text, lang = 'en') => {
    if (!text || !conversationState.streamSid) return;
    try {
      // Convert language code for TTS service
      let voiceLang = lang;
      if (lang === 'hi') {
        voiceLang = 'hi-IN'; // OpenAI TTS will handle Hindi
        console.log(`[TTS] Converting "${text}" to Hindi speech using OpenAI (${voiceLang})`);
      } else {
        console.log(`[TTS] Converting "${text}" to ${voiceLang} speech using Deepgram`);
      }
      
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
    
    // Start with English greeting, language will be detected from user's first response
    await enqueueTTS(greeting, 'en');
  };

  // Helper function to format OTP for proper pronunciation
  const formatOtpForSpeech = (text) => {
    return text.replace(/\bOTP\b/g, 'O T P');
  };

  // Helper function to format OTP digits for clear pronunciation
  const formatOtpDigits = (otp) => {
    // Convert each digit to its word form for clearer pronunciation
    const digitWords = {
      '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
      '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine'
    };
    
    return otp.split('').map(digit => digitWords[digit] || digit).join(', ');
  };

  // Enhanced emergency detection with SMS storage
const checkForEmergency = async (transcript) => {
    const lowered = transcript.toLowerCase();
    const emergencyKeywords = ["urgent", "emergency", "asap", "911", "accident", "danger", "ambulance"];
    
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
            
            // 🔥 Trigger EMERGENCY SMS fetch (different from regular)
            if (conversationState.callSid) {
                await triggerSmsFetchForCall(conversationState.user._id, conversationState.callSid, 'emergency');
            }
            
            if (userSettings?.fcmToken) {
                console.log('📱 Sending emergency notification to FCM token');
                
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
                
                console.log("✅ Emergency notification sent successfully");
                await safeSendAudioResponse("I understand this is an emergency. I have immediately notified the person and help is on the way. I'm also checking your recent messages for any important information.");
                
            } else {
                console.warn("⚠️ No FCM token found for user. Cannot send push notification.");
                await safeSendAudioResponse("I understand this is an emergency. Let me try to reach them immediately and check your messages for important information.");
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

  // Detect caller role and extract company information
  const detectCallerRole = (transcript) => {
    const text = transcript.toLowerCase();
    
    // Check for delivery-related keywords and extract company
    if (text.includes('delivery') || text.includes('package') || text.includes('courier')) {
      // Extract company name from common patterns
      const companyPatterns = [
        /delivery from (\w+)/i,           // "delivery from Amazon"
        /package from (\w+)/i,            // "package from Flipkart"
        /courier from (\w+)/i,            // "courier from Zomato"
        /(\w+) delivery/i,                // "Amazon delivery"
        /(\w+) package/i,                 // "Flipkart package"
        /i have a (\w+) delivery/i,       // "I have a Swiggy delivery"
        /i have a (\w+) package/i,        // "I have a Amazon package"
      ];
      
      // List of generic words to exclude from company extraction
      const genericWords = ['a', 'the', 'my', 'your', 'this', 'that', 'some', 'any', 'new', 'old'];
      
      for (const pattern of companyPatterns) {
        const match = text.match(pattern);
        if (match && match[1] && !genericWords.includes(match[1].toLowerCase())) {
          const company = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
          console.log(`[COMPANY EXTRACTION] Found company: ${company} from transcript: "${transcript}"`);
          
          // Store the company information immediately
          if (!conversationState.collected_info) {
            conversationState.collected_info = {};
          }
          conversationState.collected_info.company = company;
          console.log(`[COMPANY STORAGE] Stored company in conversation state: ${company}`);
          break;
        }
      }
      
      // Special case: "I have a delivery for [name]" - this is a delivery person
      if (text.includes('delivery for') || text.includes('package for')) {
        console.log(`[DELIVERY PERSON] Detected delivery person with transcript: "${transcript}"`);
        
        // Extract recipient name from "delivery for [name]" or "package for [name]"
        const recipientPatterns = [
          /delivery for ([^.]+)/i,     // "delivery for रुचित" or "delivery for John"
          /package for ([^.]+)/i,      // "package for रुचित" 
        ];
        
        for (const pattern of recipientPatterns) {
          const match = transcript.match(pattern); // Use original transcript, not lowercased
          if (match && match[1]) {
            const recipient = match[1].trim();
            console.log(`[RECIPIENT EXTRACTION] Found recipient: ${recipient} from transcript: "${transcript}"`);
            
            // Store recipient information
            if (!conversationState.collected_info) {
              conversationState.collected_info = {};
            }
            conversationState.collected_info.recipient = recipient;
            conversationState.collected_info.delivery_type = 'for_recipient';
            
            console.log(`[RECIPIENT STORAGE] Stored recipient in conversation state: ${recipient}`);
            break;
          }
        }
      }
      
      return 'delivery';
    }
    
    // Check for family-related keywords
    if (text.includes('mom') || text.includes('dad') || text.includes('family') || text.includes('brother') || text.includes('sister')) {
      return 'family';
    }
    
    // Don't immediately classify greetings as unknown - wait for more context
    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
    if (greetings.some(greeting => text.includes(greeting))) {
      return 'greeting'; // Special case to wait for more context
    }
    
    return 'unknown';
  };

  // Detect language from transcript
  const detectLanguage = (text) => {
    // Enhanced Hindi detection patterns
    const hindiPattern = /[\u0900-\u097F]/; // Devanagari script
    const hindiWords = /\b(है|हैं|मेरे|मेरा|पास|का|के|की|में|से|को|ने|और|यह|वह|आप|हम|तुम|हो|होगा|करना|करे|जी|हाँ|नहीं|क्या|कैसे|कहाँ|कब|डिलीवरी|पैकेज)\b/;
    
    // More specific romanized Hindi patterns (avoid common English words)
    const strongRomanHindi = /\b(haan|nahi|kya|kaise|kahan|aapko|hamara|tumhara|karo|karna|chahiye)\b/i;
    const mediumRomanHindi = /\b(hai|mere|mera|aap|hum|tum)\b/i;
    
    // Check for Devanagari script (strongest indicator)
    if (hindiPattern.test(text)) {
      console.log(`[LANGUAGE] Hindi detected via Devanagari script`);
      return 'hi';
    }
    
    // Check for common Hindi words in Devanagari
    if (hindiWords.test(text)) {
      console.log(`[LANGUAGE] Hindi detected via Hindi words`);
      return 'hi';
    }
    
    // Check for strong romanized Hindi indicators
    const strongMatches = text.match(strongRomanHindi);
    if (strongMatches && strongMatches.length >= 1) {
      console.log(`[LANGUAGE] Hindi detected via strong romanized text: ${strongMatches.join(', ')}`);
      return 'hi';
    }
    
    // Check for medium romanized Hindi indicators (need multiple)
    const mediumMatches = text.match(mediumRomanHindi);
    if (mediumMatches && mediumMatches.length >= 2) {
      console.log(`[LANGUAGE] Hindi detected via multiple romanized indicators: ${mediumMatches.join(', ')}`);
      return 'hi';
    }
    
    // Check for combination: at least one medium + contains typical Hindi sentence structure
    if (mediumMatches && mediumMatches.length >= 1) {
      // Look for typical Hindi sentence patterns
      const hindiPatterns = /\b(paas|wala|wali|ke liye|ki tarah|se)\b/i;
      if (hindiPatterns.test(text)) {
        console.log(`[LANGUAGE] Hindi detected via romanized word + Hindi pattern: ${mediumMatches.join(', ')}`);
        return 'hi';
      }
    }
    
    console.log(`[LANGUAGE] English detected (default)`);
    return 'en'; // Default to English
  };

  // Generate AI response
  const generateAIResponse = async (transcript) => {
    try {
      // Detect the caller's language only if not already established
      let currentLanguage = conversationState.language;
      
      if (!currentLanguage) {
        // First time - detect and set the conversation language
        const detectedLanguage = detectLanguage(transcript);
        console.log(`[LANGUAGE] First detection: ${detectedLanguage} for text: "${transcript}"`);
        conversationState.language = detectedLanguage;
        currentLanguage = detectedLanguage;
      } else {
        // Language already established - only override if the new detection is very strong
        const detectedLanguage = detectLanguage(transcript);
        console.log(`[LANGUAGE] Current: ${currentLanguage}, Detected: ${detectedLanguage} for text: "${transcript}"`);
        
        // Only change language if:
        // 1. Current is English and we detect strong Hindi indicators
        // 2. Current is Hindi and we detect clear English-only text
        if ((currentLanguage === 'en' && detectedLanguage === 'hi') ||
            (currentLanguage === 'hi' && detectedLanguage === 'en' && !/[\u0900-\u097F]/.test(transcript))) {
          console.log(`[LANGUAGE] Switching from ${currentLanguage} to ${detectedLanguage}`);
          conversationState.language = detectedLanguage;
          currentLanguage = detectedLanguage;
        } else {
          console.log(`[LANGUAGE] Maintaining conversation language: ${currentLanguage}`);
        }
      }
      
      const requestBody = {
        caller_role: conversationState.callerRole,
        new_message: transcript,
        history: conversationState.chatHistory,
        conversation_stage: conversationState.conversation_stage,
        collected_info: conversationState.collected_info || {}, // Pass existing collected info
        call_sid: conversationState.callSid,  // Include call SID for SMS requests
        response_language: currentLanguage // Tell the AI model to respond in this language
      };
      
      console.log(`[AI REQUEST] Sending to AI model - Stage: ${conversationState.conversation_stage}, Collected Info:`, JSON.stringify(conversationState.collected_info, null, 2));
      
      const response = await axios.post(process.env.AI_ENDPOINT_URL || 'http://localhost:5000/generate', requestBody);
      
      // Post-process AI response to fix OTP pronunciation
      if (response.data.response_text) {
        response.data.response_text = formatOtpForSpeech(response.data.response_text);
      }
      
      // Validate and clean AI response - remove fake/generated order IDs
      if (response.data.collected_info && response.data.collected_info.order_id) {
        const orderId = response.data.collected_info.order_id;
        // Check if order ID looks like a UUID (AI-generated) and remove it
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (uuidPattern.test(orderId)) {
          console.log(`[AI VALIDATION] Removing AI-generated fake order ID: ${orderId}`);
          delete response.data.collected_info.order_id;
        }
      }
      
      // Check if AI model is requesting SMS
      if (response.data.requires_sms === true) {
          console.log('[SMS] AI model requested SMS data for call:', conversationState.callSid);
          await handleSmsRequest(response.data);
      }
        
      return response.data;
    } catch (error) {
      console.error('[API ERROR] Backend request failed:', error.message);
      throw error;
    }
  };

  // Enhanced SMS request handling for AI
  const handleSmsRequest = async (aiResponse, transcript) => {
      try {
          if (!conversationState.callSid) {
              console.error('❌ No call SID available for SMS fetch');
              return;
          }

          // Check if we need to trigger a fresh SMS fetch
          const company = conversationState.collected_info?.company || aiResponse.company_requested || 'unknown';
          console.log(`[SMS REQUEST] Looking for ${company} OTP for user ${conversationState.user._id}`);
          
          // Use our SMS verification service which includes simulation fallback
          const smsResult = await smsVerificationService.checkForOTP(conversationState.user._id, company, conversationState.callSid);
          
          if (!smsResult.found) {
              console.log('🔄 No SMS found for call, triggering fresh fetch');
              await triggerSmsFetchForCall(conversationState.user._id, conversationState.callSid, 'regular');
              
              // Wait a moment for fresh data to arrive
              console.log('⏳ Waiting 2 seconds for fresh SMS data...');
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Try again after triggering fetch with increased limit
              const retryResult = await smsVerificationService.checkForOTP(conversationState.user._id, company, conversationState.callSid);
              if (retryResult.found) {
                  console.log(`[OTP FOUND ON RETRY] Found ${company} OTP: ${retryResult.otp}`);
                  // Store the found OTP in conversation state
                  conversationState.found_otp = retryResult.otp;
                  
                  // Update the AI response to show we need tracking verification
                  aiResponse.otp_found = true;
                  aiResponse.otp_value = retryResult.otp;
                  aiResponse.response_text = `Great! I found your ${company} O T P. For security, please provide your tracking ID or order ID to verify this delivery.`;
                  aiResponse.conversation_stage = 'asking_tracking_id';
                  aiResponse.intent = 'verify_tracking';
              } else {
                  console.log(`[OTP NOT FOUND] No ${company} OTP found in SMS messages after fresh fetch`);
                  // Try one more aggressive fetch with emergency priority
                  console.log('🚨 Triggering emergency SMS fetch as last resort...');
                  await triggerSmsFetchForCall(conversationState.user._id, conversationState.callSid, 'emergency');
                  
                  // Wait longer for emergency fetch
                  await new Promise(resolve => setTimeout(resolve, 3000));
                  
                  // Final attempt
                  const finalResult = await smsVerificationService.checkForOTP(conversationState.user._id, company, conversationState.callSid);
                  if (finalResult.found) {
                      console.log(`[OTP FOUND ON FINAL RETRY] Found ${company} OTP: ${finalResult.otp}`);
                      conversationState.found_otp = finalResult.otp;
                      aiResponse.otp_found = true;
                      aiResponse.otp_value = finalResult.otp;
                      aiResponse.response_text = `Great! I found your ${company} O T P. For security, please provide your tracking ID or order ID to verify this delivery.`;
                      aiResponse.conversation_stage = 'asking_tracking_id';
                      aiResponse.intent = 'verify_tracking';
                  } else {
                      // Gracefully end the call when no real OTP is found
                      aiResponse.response_text = `I'm sorry, but I couldn't find any recent O T P for ${company} in your messages, even after checking for the latest data. Without a valid O T P, I cannot help with this delivery. Please contact ${company} directly for assistance. Thank you for calling. Goodbye!`;
                      aiResponse.conversation_stage = 'call_ending';
                      aiResponse.intent = 'end_call';
                      aiResponse.end_call = true;
                  }
              }
          } else {
              console.log(`[OTP FOUND] Found ${company} OTP: ${smsResult.otp}`);
              // Store the found OTP in conversation state
              conversationState.found_otp = smsResult.otp;
              
              // Update the AI response to show we need tracking verification
              aiResponse.otp_found = true;
              aiResponse.otp_value = smsResult.otp;
              aiResponse.response_text = `Great! I found your ${company} O T P. For security, please provide your tracking ID or order ID to verify this delivery.`;
              aiResponse.conversation_stage = 'asking_tracking_id';
              aiResponse.intent = 'verify_tracking';
          }

          // Try to fetch actual SMS messages for additional context (but don't depend on it)
          try {
              const smsResponse = await axios.post('https://ff437a8586e7.ngrok-free.app/api/sms/call/latest', {
                  callSid: conversationState.callSid,
                  limit: 20
              });

              if (smsResponse.data.success && smsResponse.data.data) {
                  console.log(`[SMS] Fetched ${smsResponse.data.count} messages for AI model`);
              }
          } catch (httpError) {
              console.log('[SMS HTTP] Could not fetch via HTTP, using service result');
          }

      } catch (error) {
          console.error('[SMS ERROR] Failed to process SMS request:', error);
          // Continue with original AI response if SMS fails
      }
  };

  // Extract OTP from SMS messages
  const extractOTPFromMessages = (messages, company) => {
    try {
      if (!messages || !Array.isArray(messages)) {
        return { found: false, otp: null };
      }
      
      const companyLower = company?.toLowerCase() || '';
      
      for (const message of messages) {
        const messageText = message.message?.toLowerCase() || '';
        const sender = message.sender?.toLowerCase() || '';
        
        // Check if message is from the company or mentions the company
        const isRelevantMessage = 
          messageText.includes(companyLower) || 
          sender.includes(companyLower) ||
          (companyLower === 'swiggy' && (messageText.includes('delivery') || messageText.includes('order'))) ||
          (companyLower === 'amazon' && messageText.includes('delivery')) ||
          (companyLower === 'zomato' && (messageText.includes('food') || messageText.includes('order')));
        
        if (isRelevantMessage) {
          // Look for OTP patterns in the message
          const otpPatterns = [
            /otp[:\s-]*(\d{4,8})/i,
            /code[:\s-]*(\d{4,8})/i,
            /verification[:\s-]*(\d{4,8})/i,
            /pin[:\s-]*(\d{4,8})/i,
            /\b(\d{4,8})\s*(?:is your|otp|code|pin)/i,
            /\b(\d{6})\b/g // Generic 6-digit pattern
          ];
          
          for (const pattern of otpPatterns) {
            const match = messageText.match(pattern);
            if (match && match[1]) {
              console.log(`[OTP PATTERN] Found OTP "${match[1]}" in message from ${message.sender}`);
              return { 
                found: true, 
                otp: match[1], 
                message: message.message,
                sender: message.sender 
              };
            }
          }
        }
      }
      
      return { found: false, otp: null };
    } catch (error) {
      console.error('[OTP EXTRACTION ERROR]', error);
      return { found: false, otp: null };
    }
  };

  // Handle OTP Verification Flow
  const handleOTPVerification = async (aiResponse, conversationState) => {
    try {
      const company = conversationState.collected_info?.company || aiResponse.company_requested;
      const userId = conversationState.user?._id;
      
      if (!company) {
        console.error('[OTP VERIFICATION] No company specified for OTP verification');
        await safeSendAudioResponse('Sorry, I need to know which company this O T P is for.');
        return;
      }
      
      console.log(`[OTP VERIFICATION] Starting verification for ${company}`);
      
      // If we already found OTP in SMS processing, use it directly
      if (aiResponse.otp_found && aiResponse.otp_value) {
        console.log(`[OTP DIRECT] Using OTP found in SMS: ${aiResponse.otp_value}`);
        
        const otpMessage = `Great! I found your ${company} O T P: ${formatOtpDigits(aiResponse.otp_value)}`;
        await safeSendAudioResponse(otpMessage);
        
        // Update conversation state
        conversationState.conversation_stage = 'otp_provided';
        conversationState.current_intent = 'otp_shared';
        
        // Update chat history
        conversationState.chatHistory.push({
          role: "assistant", 
          content: otpMessage
        });
        
        return;
      }
      
      // Fall back to our SMS verification service
      const smsResult = await smsVerificationService.checkForOTP(userId, company, conversationState.callSid);
      
      if (smsResult.found) {
        console.log(`[OTP FOUND] OTP found for ${company}: ${smsResult.otp}`);
        
        // Check if we already have tracking/order information from AI
        const hasTrackingInfo = conversationState.collected_info?.order_id || 
                               conversationState.collected_info?.tracking_id ||
                               conversationState.collected_info?.tracking_number;
        
        if (hasTrackingInfo) {
          console.log(`[TRACKING FOUND] AI already collected tracking info:`, hasTrackingInfo);
          // Verify the existing tracking info
          const trackingToVerify = hasTrackingInfo;
          const verificationResult = await smsVerificationService.verifyTrackingId(
            trackingToVerify,
            company,
            conversationState.callSid
          );
          
          if (verificationResult.verified) {
            // Success! Share the OTP immediately
            const otpMessage = `Perfect! I verified your tracking ID and found your ${company} O T P: ${formatOtpDigits(smsResult.otp)}`;
            await safeSendAudioResponse(otpMessage);
            
            // Update conversation state
            conversationState.conversation_stage = 'otp_provided';
            conversationState.current_intent = 'otp_shared';
            
            // Update chat history
            conversationState.chatHistory.push({
              role: "assistant", 
              content: otpMessage
            });
            
            return;
          } else {
            // Invalid tracking ID - ask for correct one
            const invalidMessage = `I have your ${company} OTP, but the tracking ID doesn't match. Please provide the correct tracking ID or order ID.`;
            await safeSendAudioResponse(invalidMessage);
            
            conversationState.conversation_stage = 'asking_tracking_id';
            conversationState.current_intent = 'verify_tracking';
            conversationState.found_otp = smsResult.otp;
            
            conversationState.chatHistory.push({
              role: "assistant", 
              content: invalidMessage
            });
            
            return;
          }
        } else {
          // Ask for tracking ID verification
          const trackingPrompt = `Great! I found your ${company} OTP. For security, please provide your tracking ID or order ID to verify this delivery.`;
          
          // Update conversation stage to ask for tracking
          conversationState.conversation_stage = 'asking_tracking_id';
          conversationState.current_intent = 'verify_tracking';
          conversationState.found_otp = smsResult.otp; // Store the found OTP
          
          await safeSendAudioResponse(trackingPrompt);
          
          // Update chat history with the new message
          conversationState.chatHistory.push({
            role: "assistant", 
            content: trackingPrompt
          });
        }
        
      } else {
        console.log(`[OTP NOT FOUND] No OTP found for ${company}`);
        
        // No OTP found - ask user for approval - get FCM token from UserSettings
        try {
          const userSettings = await UserSettings.findOne({ 
            userId: conversationState.user._id 
          });
          
          if (userSettings?.fcmToken) {
            console.log(`[APPROVAL REQUEST] Requesting user approval for ${company} OTP`);
            
            const approvalResult = await smsVerificationService.requestUserApproval(
              userId,
              userSettings.fcmToken,
              company,
              conversationState.callLog?.callerNumber,
              conversationState.callSid
            );
            
            if (approvalResult.sent) {
              const approvalPrompt = `I couldn't find a recent ${company} O T P in your messages. I've sent a notification to approve sharing any available O T P. Please check your phone and approve if you want to share the O T P.`;
              
              conversationState.conversation_stage = 'waiting_approval';
              conversationState.current_intent = 'awaiting_user_approval';
              conversationState.approval_id = approvalResult.approvalId;
              
              await safeSendAudioResponse(approvalPrompt);
              
              conversationState.chatHistory.push({
                role: "assistant",
                content: approvalPrompt
              });
            } else {
              await safeSendAudioResponse(`Sorry, I couldn't find a recent ${company} O T P and couldn't send an approval request. Please try again later.`);
            }
          } else {
            await safeSendAudioResponse(`Sorry, I couldn't find a recent ${company} O T P and no notification service is available.`);
          }
        } catch (fcmError) {
          console.error('[FCM ERROR in OTP flow]:', fcmError);
          await safeSendAudioResponse(`Sorry, I couldn't find a recent ${company} O T P and there was an error with the notification service.`);
        }
      }
      
    } catch (error) {
      console.error('[OTP VERIFICATION ERROR]', error);
      await safeSendAudioResponse('Sorry, there was an error checking for your O T P. Please try again.');
    }
  };

  // Process response queue
  const processResponseQueue = async () => {
    if (conversationState.isProcessingResponse || 
        conversationState.responseQueue.length === 0 || 
        conversationState.isEndingCall) {
      return;
    }
    
    conversationState.isProcessingResponse = true;

    const transcript = conversationState.responseQueue.shift();
    conversationState.responseQueue = [];

    try {
      // 1️⃣ Emergency Detection
      await checkForEmergency(transcript);

      // 2️⃣ Detect caller role if not set or if it's currently 'greeting'
      if (!conversationState.callerRole || conversationState.callerRole === 'greeting') {
        const newRole = detectCallerRole(transcript);
        
        // If we detect a proper role (not greeting), update it
        if (newRole !== 'greeting' && newRole !== 'unknown') {
          conversationState.callerRole = newRole;
          console.log(`[System]: Identified role as '${conversationState.callerRole}'`);
        } else if (!conversationState.callerRole) {
          // First time and it's a greeting, set as greeting to wait for more context
          conversationState.callerRole = newRole;
          console.log(`[System]: Initial role set as '${conversationState.callerRole}' - waiting for more context`);
        }
        // If role is still 'greeting' after several attempts, we'll let AI handle it
      }

      // 3️⃣ Generate AI response OR handle special flows
      let aiResponse;
      
      // Handle tracking ID verification flow
      if (conversationState.conversation_stage === 'asking_tracking_id' && conversationState.found_otp) {
        console.log(`[TRACKING VERIFICATION] Processing tracking ID: "${transcript}"`);
        
        const lowerTranscript = transcript.toLowerCase();
        
        // Check if delivery person says they don't have tracking ID
        if (lowerTranscript.includes('no tracking') || 
            lowerTranscript.includes("don't have") || 
            lowerTranscript.includes("i don't know") ||
            lowerTranscript.includes('not available') ||
            lowerTranscript.includes('no order id') ||
            lowerTranscript.includes('not given')) {
          
          console.log(`[TRACKING VERIFICATION] Delivery person doesn't have tracking ID, requesting approval`);
          console.log(`[TRACKING VERIFICATION] 🔍 Debug Info:`, {
            userId: conversationState.user._id,
            company: conversationState.collected_info.company,
            callSid: conversationState.callSid,
            callerNumber: conversationState.callLog?.callerNumber
          });
          
          // Send push notification for manual approval - get FCM token from UserSettings
          try {
            console.log(`[APPROVAL FLOW] 📋 Looking up user settings for userId: ${conversationState.user._id}`);
            const userSettings = await UserSettings.findOne({ 
              userId: conversationState.user._id 
            });
            
            console.log(`[APPROVAL FLOW] 🔍 User settings found:`, userSettings ? 'Yes' : 'No');
            console.log(`[APPROVAL FLOW] 📱 FCM Token:`, userSettings?.fcmToken ? `Present (${userSettings.fcmToken.length} chars)` : 'Missing');
            
            if (userSettings?.fcmToken) {
              console.log(`[APPROVAL FLOW] � Initiating FCM approval request for ${conversationState.collected_info.company} OTP`);
              
              const approvalResult = await smsVerificationService.requestUserApproval(
                conversationState.user._id,
                userSettings.fcmToken,
                conversationState.collected_info.company,
                conversationState.callLog?.callerNumber,
                conversationState.callSid
              );
              
              console.log(`[APPROVAL FLOW] 📤 Approval result:`, approvalResult);
              
              if (approvalResult.sent) {
                const approvalPrompt = `I understand you don't have the tracking ID. I've sent a priority notification for manual approval. Please wait while the recipient approves sharing the O T P.`;
                
                conversationState.conversation_stage = 'waiting_approval';
                conversationState.current_intent = 'awaiting_user_approval';
                conversationState.approval_id = approvalResult.approvalId;
                
                await safeSendAudioResponse(approvalPrompt);
                
                conversationState.chatHistory.push({role: "user", content: transcript});
                conversationState.chatHistory.push({role: "assistant", content: approvalPrompt});
                
                console.log(`[APPROVAL FLOW] ✅ Approval notification sent successfully with ID: ${approvalResult.approvalId}`);
              } else {
                console.error(`[APPROVAL FLOW] ❌ Failed to send approval notification:`, approvalResult.error);
                await safeSendAudioResponse('Sorry, I could not send the approval request. Please try again later.');
              }
            } else {
              console.warn(`[APPROVAL FLOW] ⚠️ No FCM token found for user - cannot send approval notification`);
              await safeSendAudioResponse('Sorry, I cannot process this request without tracking ID verification.');
            }
          } catch (fcmError) {
            console.error('[FCM ERROR in no tracking flow]:', fcmError);
            await safeSendAudioResponse('Sorry, there was an error with the approval process. Please provide your tracking ID if you have it.');
          }
          
          // Skip AI model call since we handled this internally
          aiResponse = null;
          
        } else {
          // Try to verify the provided tracking ID
          console.log(`[TRACKING DEBUG] About to verify tracking ID. CallSid: ${conversationState.callSid}, Company: ${conversationState.collected_info.company}`);
          
          const verificationResult = await smsVerificationService.verifyTrackingId(
            transcript,
            conversationState.collected_info.company,
            conversationState.callSid
          );
          
          if (verificationResult.verified) {
            // Success! Share the OTP
            const otpMessage = `Tracking ID verified! Your ${conversationState.collected_info.company} O T P is: ${formatOtpDigits(conversationState.found_otp)}`;
            await safeSendAudioResponse(otpMessage);
            
            // Update conversation state
            conversationState.conversation_stage = 'otp_provided';
            conversationState.current_intent = 'otp_shared';
            
            // Add to chat history
            conversationState.chatHistory.push({role: "user", content: transcript});
            conversationState.chatHistory.push({role: "assistant", content: otpMessage});
          } else {
            // Invalid tracking ID - check if they want to request approval instead
            if (lowerTranscript.includes('approval') || 
                lowerTranscript.includes('notification') || 
                lowerTranscript.includes('send notification') ||
                lowerTranscript.includes('yes') && conversationState.conversation_stage === 'asking_tracking_id') {
              
              console.log(`[TRACKING VERIFICATION] User requested manual approval instead`);
              
              // Send push notification for manual approval - get FCM token from UserSettings
              try {
                const userSettings = await UserSettings.findOne({ 
                  userId: conversationState.user._id 
                });
                
                if (userSettings?.fcmToken) {
                  const approvalResult = await smsVerificationService.requestUserApproval(
                    conversationState.user._id,
                    userSettings.fcmToken,
                    conversationState.collected_info.company,
                    conversationState.callLog?.callerNumber,
                    conversationState.callSid
                  );
                  
                  if (approvalResult.sent) {
                    const approvalPrompt = `I've sent a notification for manual approval. Please wait while the recipient approves sharing the O T P.`;
                    
                    conversationState.conversation_stage = 'waiting_approval';
                    conversationState.current_intent = 'awaiting_user_approval';
                    conversationState.approval_id = approvalResult.approvalId;
                    
                    await safeSendAudioResponse(approvalPrompt);
                    
                    conversationState.chatHistory.push({role: "user", content: transcript});
                    conversationState.chatHistory.push({role: "assistant", content: approvalPrompt});
                  } else {
                    await safeSendAudioResponse('Sorry, I could not send the approval request. Please try again later.');
                  }
                } else {
                  await safeSendAudioResponse('Sorry, I cannot send approval notifications. Please provide your tracking ID to continue.');
                }
              } catch (fcmError) {
                console.error('[FCM ERROR]:', fcmError);
                await safeSendAudioResponse('Sorry, there was an error sending the approval request. Please provide your tracking ID to continue.');
              }
            } else {
              // Just invalid tracking ID, ask to try again
              await safeSendAudioResponse(verificationResult.message);
              
              // Ask for tracking ID again or offer push notification alternative
              const retryMessage = "Would you like to try another tracking ID, or shall I send a notification for approval?";
              await safeSendAudioResponse(retryMessage);
              
              conversationState.chatHistory.push({role: "user", content: transcript});
              conversationState.chatHistory.push({role: "assistant", content: verificationResult.message + " " + retryMessage});
            }
          }
          
          // Skip AI model call since we handled this internally
          aiResponse = null;
        }
        
      } else if (conversationState.conversation_stage === 'waiting_approval') {
        // Handle responses while waiting for approval
        const lowerTranscript = transcript.toLowerCase();
        
        if (lowerTranscript.includes('approved') || lowerTranscript.includes('yes') || lowerTranscript.includes('allowed')) {
          // User manually says they approved - check for pending approval
          const pendingApproval = smsVerificationService.getPendingApproval(conversationState.callSid);
          
          if (pendingApproval.pending) {
            // Simulate approval
            await smsVerificationService.processUserResponse(pendingApproval.approvalId, true);
            
            // Share a mock OTP (in real implementation, this would come from SMS)
            const mockOTP = "123456";
            const otpMessage = `Great! Your ${pendingApproval.company} O T P is: ${formatOtpDigits(mockOTP)}`;
            
            await safeSendAudioResponse(otpMessage);
            
            conversationState.conversation_stage = 'otp_provided';
            conversationState.current_intent = 'otp_shared';
            
            conversationState.chatHistory.push({role: "user", content: transcript});
            conversationState.chatHistory.push({role: "assistant", content: otpMessage});
          } else {
            await safeSendAudioResponse("I don't have any pending approval request. Please try requesting the O T P again.");
          }
        } else {
          // Still waiting
          await safeSendAudioResponse("I'm still waiting for you to approve the notification on your phone. Please check and approve if you want to share the O T P.");
        }
        
        aiResponse = null;
        
      } else {
        // Normal AI flow
        aiResponse = await generateAIResponse(transcript);
      }

      if (aiResponse) {
        // 4️⃣ Send AI audio response in the same language as the caller
        if (aiResponse.response_text) {
          // Use stored conversation language for consistency
          const responseLanguage = conversationState.language || aiResponse.language || 'en';
          console.log(`[TTS] Responding in language: ${responseLanguage}`);
          await safeSendAudioResponse(aiResponse.response_text, responseLanguage);
        }

        // 5️⃣ Update conversation state
        // Always update history manually if AI model doesn't provide it
        if (aiResponse.updated_history) {
          conversationState.chatHistory = aiResponse.updated_history;
        } else {
          // Manually update history if AI model doesn't provide it
          conversationState.chatHistory.push({role: "user", content: transcript});
          if (aiResponse.response_text) {
            conversationState.chatHistory.push({role: "assistant", content: aiResponse.response_text});
          }
        }
        
        // Store the FULL collected_info for next call
        conversationState.collected_info = aiResponse.collected_info || conversationState.collected_info;
        conversationState.conversation_stage = aiResponse.conversation_stage || conversationState.conversation_stage;
        conversationState.current_intent = aiResponse.intent || conversationState.current_intent;

        // 🚀 Override AI stage if we clearly detect delivery context but AI stage is wrong
        if (conversationState.callerRole === 'delivery' && 
            conversationState.collected_info.delivery_type === 'for_recipient' &&
            (conversationState.conversation_stage === 'asking_name' || conversationState.conversation_stage === 'start')) {
          console.log(`[STAGE OVERRIDE] Delivery person detected, overriding stage from ${conversationState.conversation_stage} to greeting_delivery`);
          conversationState.conversation_stage = 'greeting_delivery';
          
          // Also provide a better response for delivery people
          if (conversationState.collected_info.recipient) {
            const betterResponse = `Hi! Yes, I can help with the delivery for ${conversationState.collected_info.recipient}. What do you need assistance with?`;
            console.log(`[DELIVERY OVERRIDE] Providing better response for delivery person`);
            await safeSendAudioResponse(betterResponse, conversationState.language || 'en');
            
            // Update chat history with better response
            if (conversationState.chatHistory.length > 0) {
              conversationState.chatHistory[conversationState.chatHistory.length - 1].content = betterResponse;
            }
          }
        }

        console.log(`[CONVERSATION] Intent: ${aiResponse.intent}, Stage: ${aiResponse.conversation_stage}`);
        console.log(`[COLLECTED INFO] Current collected_info:`, JSON.stringify(conversationState.collected_info, null, 2));
        console.log(`[HISTORY] Conversation history now has ${conversationState.chatHistory.length} messages`);

        // 🔐 SMS/OTP Verification Logic
        if (aiResponse.requires_sms && aiResponse.intent === 'fetch_otp' && conversationState.collected_info.company) {
          console.log(`[OTP FLOW] Starting OTP verification for ${conversationState.collected_info.company}`);
          await handleOTPVerification(aiResponse, conversationState);
        }
        
      } else {
        // AI response was bypassed (we handled the flow internally)
        console.log(`[BYPASS] AI response bypassed - handled internally`);
        console.log(`[CONVERSATION] Current Stage: ${conversationState.conversation_stage}, Intent: ${conversationState.current_intent}`);
        console.log(`[HISTORY] Conversation history now has ${conversationState.chatHistory.length} messages`);
      }

      // 6️⃣ Save transcripts to MongoDB (for both AI and bypassed responses)
      if (conversationState.callSid) {
        await saveTranscriptToMongo(conversationState.callSid, transcript, 'user');
        
        // Only save AI response if we actually got one
        if (aiResponse && aiResponse.response_text) {
          await saveTranscriptToMongo(conversationState.callSid, aiResponse.response_text, 'ai');
        }
      } else {
        console.error('❌ Cannot save transcript: callSid not available in conversation state');
      }

      // 7️⃣ Hang up logic if end_of_call OR after OTP is shared
      if ((aiResponse && aiResponse.stage === 'end_of_call') || 
          conversationState.conversation_stage === 'end_of_call' ||
          (conversationState.conversation_stage === 'otp_provided' && conversationState.current_intent === 'otp_shared')) {
          
          // If we just shared an OTP, say goodbye first
          if (conversationState.conversation_stage === 'otp_provided' && conversationState.current_intent === 'otp_shared') {
            console.log('[CALL END] OTP shared successfully - ending call with goodbye');
            
            // Mark that we're ending the call to prevent further processing
            conversationState.isEndingCall = true;
            
            await safeSendAudioResponse('Great! I\'ve shared your O T P. Have a nice day and enjoy your delivery!');
            
            // Wait longer for the goodbye message to fully play (estimate ~5-6 seconds for full message)
            setTimeout(async () => {
              console.log('[AI] Ending call after OTP delivery - goodbye message should be complete');
              
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
              setTimeout(() => ws.close(), 1000);
            }, 6000); // Wait 6 seconds for goodbye message to play completely
            
            return; // Exit early to prevent further processing
          } else {
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
        conversationState.callSid = msg.start.callSid; // Store callSid
        conversationState.sttService = new SttService();
        conversationState.sttService.on('speech_transcribed', onTranscript);
        
        if (msg.start.callSid) {
          const initialized = await initializeCallData(msg.start.callSid);
          if (!initialized) {
            console.error('❌ Failed to initialize call data');
          } else {
            // Store the active conversation for OTP approval resume
            conversationManager.storeActiveConversation(msg.start.callSid, conversationState);
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
        // Remove from active conversations before cleanup
        if (conversationState.callSid) {
          conversationManager.removeActiveConversation(conversationState.callSid);
        }
        cleanup();
        break;
    }
  });

  const cleanup = () => {
    if (conversationState.sttService) conversationState.sttService.close();
    conversationState.sttService = null;
    conversationState.responseQueue = [];
    conversationState.isProcessingResponse = false;
    
    // Remove from active conversations if callSid exists
    if (conversationState.callSid) {
      conversationManager.removeActiveConversation(conversationState.callSid);
    }
    
    conversationState.callSid = null;
    conversationState.user = null;
    conversationState.callLog = null;
    conversationState.ws = null;
  };

  ws.on('close', cleanup);
  ws.on('error', (err) => { 
    console.error('WebSocket error:', err); 
    cleanup(); 
  });
};

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