/**
 * Professional Conversation Flow Service
 * Handles intelligent conversation management with context-aware decision making
 */

class ConversationFlowService {
  constructor() {
    // Supported delivery organizations
    this.supportedOrganizations = [
      "amazon",
      "flipkart",
      "swiggy",
      "zomato",
      "dunzo",
      "blinkit",
      "zepto",
      "bigbasket",
      "meesho",
      "myntra",
      "ajio",
      "delhivery",
      "bluedart",
      "dtdc",
      "fedex",
      "dhl",
      "uber eats",
      "rapido",
    ];

    // Organization aliases for better detection
    this.organizationAliases = {
      amazon: ["amazon", "amzn", "amazon delivery"],
      flipkart: ["flipkart", "fk", "flipkar", "ekart"],
      swiggy: ["swiggy", "swigy"],
      zomato: ["zomato", "zomto"],
      dunzo: ["dunzo"],
      blinkit: ["blinkit", "grofers"],
      zepto: ["zepto"],
      bigbasket: ["bigbasket", "big basket", "bb"],
      meesho: ["meesho"],
      myntra: ["myntra"],
      ajio: ["ajio"],
      delhivery: ["delhivery"],
      bluedart: ["bluedart", "blue dart"],
      dtdc: ["dtdc"],
      fedex: ["fedex", "fed ex"],
      dhl: ["dhl"],
      "uber eats": ["uber", "uber eats", "ubereats"],
      rapido: ["rapido"],
    };
  }

  /**
   * Analyze caller intent from transcript
   * @param {string} transcript - User's spoken text
   * @returns {object} Intent analysis result
   */
  analyzeCallerIntent(transcript) {
    const text = transcript.toLowerCase();

    // Detect if caller is a delivery person (arriving WITH a delivery)
    const deliveryPersonIndicators = [
      // English
      "i have a delivery",
      "i have your delivery",
      "delivery for",
      "package for",
      "order for",
      "i am from",
      "delivery boy",
      "delivery person",
      "your order has arrived",
      "i am here with",
      "delivery agent",
      "i reached",
      "i have reached",
      "i am at your",

      // Hindi (romanized)
      "delivery hai",
      "delivery leke aaya",
      "delivery boy hu",
      "aapka delivery",
      "order leke aaya",
      "delivery aayi hai",
      "main delivery boy hu",
      "main pahunch gaya",

      // Hindi (Devanagari)
      "डिलीवरी है",
      "डिलीवरी लेके आया",
      "डिलीवरी बॉय हूं",
      "आपका डिलीवरी",
      "ऑर्डर लेके आया",
      "डिलीवरी आई है",
      "मैं डिलीवरी बॉय हूं",
      "मैं पहुंच गया",
      "पहुँच गया",
    ];

    // Detect if caller is asking ABOUT a delivery (tracking/status)
    const deliveryInquiryIndicators = [
      "where is my delivery",
      "when will",
      "track my order",
      "order status",
      "delivery status",
      "has my order",
      "my package",
      "waiting for",
      "expected delivery",
      "kab aayega",
      "kahan hai",
      "order kahan",
      "delivery kab",
    ];

    // Check for delivery person
    const isDeliveryPerson = deliveryPersonIndicators.some((indicator) =>
      text.includes(indicator),
    );

    // Check for delivery inquiry
    const isDeliveryInquiry = deliveryInquiryIndicators.some((indicator) =>
      text.includes(indicator),
    );

    // Extract organization name
    const organization = this.extractOrganization(text);

    // Extract recipient name (for delivery person scenario)
    const recipient = this.extractRecipientName(transcript, text);

    return {
      isDeliveryPerson,
      isDeliveryInquiry,
      organization,
      recipient,
      confidence: this.calculateConfidence(
        isDeliveryPerson,
        isDeliveryInquiry,
        organization,
      ),
    };
  }

  /**
   * Extract organization name from text
   * @param {string} text - Lowercase text
   * @returns {string|null} Organization name or null
   */
  extractOrganization(text) {
    // Check each organization and its aliases
    for (const [orgName, aliases] of Object.entries(this.organizationAliases)) {
      for (const alias of aliases) {
        if (text.includes(alias)) {
          console.log(
            `[FLOW] Detected organization: ${orgName} via alias: ${alias}`,
          );
          return orgName;
        }
      }
    }

    // Try pattern matching for common phrases
    const orgPatterns = [
      /(?:from|delivery from|package from|order from)\s+(\w+)/i,
      /(\w+)\s+(?:delivery|package|order|parcel)/i,
      /i am from\s+(\w+)/i,
      /(\w+)\s+(?:ka|ki|ke)\s+delivery/i, // Hindi patterns
    ];

    for (const pattern of orgPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const detectedOrg = match[1].toLowerCase();
        // Check if it matches any known organization
        for (const [orgName, aliases] of Object.entries(
          this.organizationAliases,
        )) {
          if (aliases.includes(detectedOrg)) {
            console.log(
              `[FLOW] Detected organization: ${orgName} via pattern: ${detectedOrg}`,
            );
            return orgName;
          }
        }
      }
    }

    return null;
  }

  /**
   * Extract recipient name from transcript
   * @param {string} originalTranscript - Original transcript (with case)
   * @param {string} lowerText - Lowercase version
   * @returns {string|null} Recipient name or null
   */
  extractRecipientName(originalTranscript, lowerText) {
    const patterns = [
      /delivery for\s+([A-Za-z\u0900-\u097F\s]+?)(?:\.|,|$)/i,
      /package for\s+([A-Za-z\u0900-\u097F\s]+?)(?:\.|,|$)/i,
      /order for\s+([A-Za-z\u0900-\u097F\s]+?)(?:\.|,|$)/i,
      /([A-Za-z\u0900-\u097F]+)\s+(?:ka|ki|ke)\s+(?:liye|naam)/i,
    ];

    for (const pattern of patterns) {
      const match = originalTranscript.match(pattern);
      if (match && match[1]) {
        const recipient = match[1].trim();
        // Filter out common words that aren't names
        const excludeWords = [
          "you",
          "sir",
          "madam",
          "someone",
          "person",
          "customer",
        ];
        if (
          !excludeWords.includes(recipient.toLowerCase()) &&
          recipient.length > 1
        ) {
          console.log(`[FLOW] Detected recipient: ${recipient}`);
          return recipient;
        }
      }
    }

    return null;
  }

  /**
   * Calculate confidence score for intent detection
   * @param {boolean} isDeliveryPerson
   * @param {boolean} isDeliveryInquiry
   * @param {string|null} organization
   * @returns {number} Confidence score (0-1)
   */
  calculateConfidence(isDeliveryPerson, isDeliveryInquiry, organization) {
    let confidence = 0;

    if (isDeliveryPerson) confidence += 0.6;
    if (isDeliveryInquiry) confidence += 0.4;
    if (organization) confidence += 0.3;

    return Math.min(confidence, 1.0);
  }

  /**
   * Generate appropriate response based on conversation stage and context
   * @param {string} stage - Current conversation stage
   * @param {object} context - Conversation context
   * @param {string} language - Response language ('en' or 'hi')
   * @returns {object} Response object
   */
  generateContextualResponse(stage, context, language = "en") {
    const responses = this.getResponseTemplates(language);

    switch (stage) {
      case "initial_greeting":
        return {
          text: responses.initialGreeting,
          nextStage: "identifying_caller_type",
        };

      case "identifying_caller_type":
        // Ask clarifying question about delivery
        if (context.mentionedDelivery && !context.organization) {
          return {
            text: responses.askWhichOrganization,
            nextStage: "waiting_organization",
          };
        }
        return {
          text: responses.askCallerIntent,
          nextStage: "analyzing_intent",
        };

      case "ask_organization":
        return {
          text: responses.askWhichOrganization,
          nextStage: "waiting_organization",
        };

      case "delivery_person_identified":
        const org = context.organization || "delivery";
        return {
          text: responses.deliveryPersonGreeting.replace("{organization}", org),
          nextStage: "preparing_otp_check",
        };

      case "location_guidance":
        return {
          text: responses.providingLocation,
          nextStage: "traveling_to_location",
        };

      case "arrival_confirmed":
        return {
          text: responses.arrivedCheckingOtp,
          nextStage: "checking_for_otp",
        };

      case "otp_found":
        return {
          text: responses.foundOtpAskTracking.replace(
            "{organization}",
            context.organization || "delivery",
          ),
          nextStage: "asking_tracking_id",
        };

      case "otp_not_found":
        return {
          text: responses.otpNotFound.replace(
            "{organization}",
            context.organization || "delivery",
          ),
          nextStage: "requesting_approval",
        };

      case "tracking_verified":
        return {
          text: responses.trackingVerified,
          nextStage: "providing_otp",
        };

      default:
        return {
          text: responses.generalHelp,
          nextStage: stage,
        };
    }
  }

  /**
   * Get response templates for specified language
   * @param {string} language - 'en' or 'hi'
   * @returns {object} Response templates
   */
  getResponseTemplates(language) {
    if (language === "hi") {
      return {
        initialGreeting:
          "नमस्ते! मैं AI assistant हूं। आप किस काम से फोन किया?",
        askCallerIntent:
          "क्या आप किसी delivery के बारे में पूछना चाहते हैं, या आप कोई delivery लेकर आए हैं?",
        askWhichOrganization:
          "किस company की delivery है? जैसे Amazon, Flipkart, Swiggy, या कोई और?",
        deliveryPersonGreeting:
          "अच्छा, {organization} delivery! आपको क्या चाहिए - location या OTP?",
        providingLocation:
          "मैं आपको location बता रहा हूं। कृपया वहां पहुंचने के बाद मुझे बताएं।",
        arrivedCheckingOtp:
          "बहुत अच्छा! आप पहुंच गए हैं। मैं OTP check कर रहा हूं...",
        foundOtpAskTracking:
          "मुझे {organization} का OTP मिल गया! सुरक्षा के लिए, कृपया अपना tracking ID या order ID बताएं।",
        otpNotFound:
          "मुझे {organization} का OTP नहीं मिला। मैं approval के लिए notification भेज रहा हूं...",
        trackingVerified: "Tracking ID verify हो गया! आपका OTP है:",
        generalHelp:
          "मैं आपकी मदद के लिए यहां हूं। कृपया बताएं कि आप क्या चाहते हैं।",
      };
    }

    // English (default)
    return {
      initialGreeting: "Hello! I'm the AI assistant. How can I help you today?",
      askCallerIntent:
        "Are you calling to ask about a delivery, or are you here with a delivery?",
      askWhichOrganization:
        "Which company is the delivery from? For example, Amazon, Flipkart, Swiggy, or another service?",
      deliveryPersonGreeting:
        "Okay, {organization} delivery! What do you need - the location or an OTP?",
      providingLocation:
        "I'm providing the location now. Please let me know once you've arrived.",
      arrivedCheckingOtp: "Great! You've arrived. Let me check for the OTP...",
      foundOtpAskTracking:
        "I found the {organization} OTP! For security, please provide your tracking ID or order ID.",
      otpNotFound:
        "I couldn't find the {organization} OTP. I'm sending a notification for approval...",
      trackingVerified: "Tracking ID verified! Your OTP is:",
      generalHelp: "I'm here to help. Please tell me what you need.",
    };
  }

  /**
   * Determine next action based on current state and user input
   * @param {object} conversationState - Current conversation state
   * @param {string} transcript - Latest user input
   * @returns {object} Next action recommendation
   */
  determineNextAction(conversationState, transcript) {
    const intent = this.analyzeCallerIntent(transcript);

    // Priority 1: Delivery person with organization known
    if (intent.isDeliveryPerson && intent.organization) {
      return {
        action: "handle_delivery_person",
        organization: intent.organization,
        recipient: intent.recipient,
        confidence: intent.confidence,
        shouldAskLocation: true,
      };
    }

    // Priority 2: Delivery person but organization unknown
    if (intent.isDeliveryPerson && !intent.organization) {
      return {
        action: "ask_organization",
        reason: "delivery_person_identified_no_org",
        confidence: intent.confidence,
      };
    }

    // Priority 3: Delivery inquiry (asking about their own delivery)
    if (intent.isDeliveryInquiry) {
      return {
        action: "handle_delivery_inquiry",
        organization: intent.organization,
        confidence: intent.confidence,
      };
    }

    // Priority 4: Mentioned delivery but unclear intent
    if (
      transcript.toLowerCase().includes("delivery") ||
      transcript.toLowerCase().includes("डिलीवरी")
    ) {
      return {
        action: "clarify_intent",
        reason: "delivery_mentioned_unclear_intent",
        confidence: 0.5,
      };
    }

    // Default: Continue normal conversation
    return {
      action: "continue_conversation",
      confidence: 0.3,
    };
  }

  /**
   * Check if arrival at location is detected
   * @param {string} transcript - User input
   * @returns {boolean}
   */
  detectArrival(transcript) {
    const text = transcript.toLowerCase();
    const arrivalKeywords = [
      "arrived",
      "reached",
      "here",
      "i am here",
      "i'm here",
      "पहुंच गया",
      "पहुँच गया",
      "आ गया",
      "यहाँ हूँ",
      "यहां हूं",
      "पहुंचा",
      "reached your",
      "at your",
      "outside",
      "बाहर हूं",
    ];

    return arrivalKeywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Check if user doesn't have tracking information
   * @param {string} transcript - User input
   * @returns {boolean}
   */
  detectNoTracking(transcript) {
    const text = transcript.toLowerCase();
    const noTrackingIndicators = [
      "no tracking",
      "don't have",
      "i don't know",
      "not available",
      "no order id",
      "not given",
      "नहीं है",
      "पास नहीं",
      "मेरे पास नहीं",
      "नहीं दिया",
      "पता नहीं",
      "मालूम नहीं",
    ];

    return noTrackingIndicators.some((indicator) => text.includes(indicator));
  }

  /**
   * Validate if response is affirmative
   * @param {string} transcript - User input
   * @returns {boolean}
   */
  isAffirmativeResponse(transcript) {
    const text = transcript.toLowerCase();
    const affirmatives = [
      "yes",
      "yeah",
      "yep",
      "sure",
      "okay",
      "ok",
      "correct",
      "right",
      "हां",
      "हाँ",
      "जी",
      "ठीक है",
      "sahi",
      "theek",
    ];

    return affirmatives.some((word) => text.includes(word));
  }

  /**
   * Validate if response is negative
   * @param {string} transcript - User input
   * @returns {boolean}
   */
  isNegativeResponse(transcript) {
    const text = transcript.toLowerCase();
    const negatives = ["no", "nope", "nah", "not", "नहीं", "ना", "mat"];

    return negatives.some((word) => text.includes(word));
  }
}

module.exports = new ConversationFlowService();
