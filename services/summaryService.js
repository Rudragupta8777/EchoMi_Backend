const axios = require("axios");
const CallLog = require("../models/CallLog");

class SummaryService {
  // Generate call summary using AI
  static async generateCallSummary(callSid) {
    try {
      console.log("📝 Starting summary generation for callSid:", callSid);

      // Fetch call log with transcript
      const callLog = await CallLog.findOne({ callSid })
        .populate("userId", "name")
        .lean();

      if (!callLog) {
        console.error("❌ No call log found for callSid:", callSid);
        return null;
      }

      if (!callLog.transcript || callLog.transcript.length === 0) {
        console.warn(
          "⚠️ No transcript found for call, skipping summary generation"
        );
        console.log("📋 CallLog structure:", JSON.stringify(callLog, null, 2));
        return null;
      }

      console.log("📝 Transcript entries found:", callLog.transcript.length);
      console.log("📝 Sample transcript entry:", callLog.transcript[0]);

      // Format transcript for AI processing
      const transcriptText = this.formatTranscriptForSummary(
        callLog.transcript
      );

      // Prepare data for AI model in the format it expects
      const summaryRequest = {
        caller_role: "system",
        new_message: `GENERATE CALL SUMMARY - Please create a brief summary of this phone conversation. Focus on: 1) Who called, 2) What they wanted, 3) What assistance was provided, 4) How the call ended.

TRANSCRIPT:
${transcriptText}

Please respond with ONLY the summary, not a conversational response.`,
        history: [],
        conversation_stage: "generate_summary",
        callSid: callSid,
        callerNumber: callLog.callerNumber,
        userName: callLog.userId?.name || "Unknown",
        duration: callLog.duration || 0,
        startTime: callLog.startTime,
        requestType: "call_summary",
      };

      console.log("🤖 Sending transcript to AI for summary generation...");
      console.log(
        "📋 Summary request payload:",
        JSON.stringify(summaryRequest, null, 2)
      );
      console.log("📝 Transcript text length:", transcriptText.length);
      console.log(
        "📝 First 200 chars of transcript:",
        transcriptText.substring(0, 200)
      );

      // Call AI model for summary (using your existing AI endpoint)
      const AI_MODEL_URL =
        process.env.AI_MODEL_URL ||
        "http://localhost:8000/generate";
      const response = await axios.post(AI_MODEL_URL, summaryRequest, {
        timeout: 30000, // 30 second timeout
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log(
        "🤖 AI Model Response:",
        JSON.stringify(response.data, null, 2)
      );

      const summary = response.data?.summary || response.data?.response_text;

      console.log("📄 Extracted summary:", summary);

      // Check if the AI model returned a conversational response instead of a summary
      const isConversationalResponse = this.isConversationalResponse(summary);

      if (!summary || isConversationalResponse) {
        console.error(
          "❌ AI model returned conversational response instead of summary, generating basic summary"
        );
        const basicSummary = this.generateBasicSummary(callLog, transcriptText);
        if (basicSummary) {
          // Update call log with basic summary
          const updatedCallLog = await CallLog.findOneAndUpdate(
            { callSid },
            {
              summary: basicSummary,
              summaryGeneratedAt: new Date(),
            },
            { new: true }
          );

          return {
            success: true,
            summary: basicSummary,
            callSid,
            transcriptLength: callLog.transcript.length,
            type: "basic_summary",
          };
        }
        return null;
      }

      // Update call log with summary
      const updatedCallLog = await CallLog.findOneAndUpdate(
        { callSid },
        {
          summary: summary,
          summaryGeneratedAt: new Date(),
        },
        { new: true }
      );

      console.log("✅ Summary generated and saved for callSid:", callSid);
      console.log("📄 Summary preview:", summary.substring(0, 100) + "...");

      return {
        success: true,
        summary,
        callSid,
        transcriptLength: callLog.transcript.length,
      };
    } catch (error) {
      console.error("❌ Error generating call summary:", error.message);

      // Store error info in call log for debugging
      try {
        await CallLog.findOneAndUpdate(
          { callSid },
          {
            summaryError: error.message,
            summaryAttemptedAt: new Date(),
          }
        );
      } catch (updateError) {
        console.error(
          "❌ Error updating call log with summary error:",
          updateError
        );
      }

      return {
        success: false,
        error: error.message,
        callSid,
      };
    }
  }

  // Check if the response is conversational rather than a summary
  static isConversationalResponse(text) {
    if (!text) return false;

    const conversationalPhrases = [
      "thank you for calling",
      "have a great day",
      "i'll make sure",
      "how can i help",
      "is there anything else",
      "goodbye",
      "bye",
      "thanks for",
      "you're welcome",
    ];

    const lowerText = text.toLowerCase();

    // If the response contains typical conversational endings, it's likely not a summary
    const hasConversationalPhrases = conversationalPhrases.some((phrase) =>
      lowerText.includes(phrase)
    );

    // If the response is very short (less than 20 words), it's likely conversational
    const wordCount = text.split(" ").length;
    const isTooShort = wordCount < 20;

    // If it doesn't contain summary-like words, it's likely conversational
    const summaryWords = [
      "called",
      "contacted",
      "inquired",
      "requested",
      "discussed",
      "provided",
      "conversation",
      "caller",
    ];
    const hasSummaryWords = summaryWords.some((word) =>
      lowerText.includes(word)
    );

    return hasConversationalPhrases || (isTooShort && !hasSummaryWords);
  }

  // Generate a basic summary when AI model fails
  static generateBasicSummary(callLog, transcriptText) {
    try {
      const callerMessages = callLog.transcript.filter(
        (t) => t.speaker === "caller"
      );
      const aiMessages = callLog.transcript.filter((t) => t.speaker === "ai");

      const duration = callLog.duration || 0;
      const durationText =
        duration > 60
          ? `${Math.floor(duration / 60)}m ${duration % 60}s`
          : `${duration}s`;

      // Extract caller name from messages
      const callerName = this.extractCallerName(callerMessages);
      const callerText = callerName
        ? `${callerName}`
        : `Caller from ${callLog.callerNumber}`;

      // Extract purpose from conversation
      const purpose = this.extractDetailedPurpose(callerMessages);

      // Extract what was provided/discussed
      const assistance = this.extractAssistanceProvided(
        aiMessages,
        callerMessages
      );

      // Extract outcome
      const outcome = this.extractDetailedOutcome(aiMessages);

      let summary = `${callerText} contacted Ruchit's AI assistant. `;

      if (
        purpose !== "General inquiry from caller." &&
        purpose !== "They made a general inquiry."
      ) {
        summary += `${purpose} `;
      }

      if (assistance && !assistance.includes("general assistance")) {
        summary += `${assistance} `;
      }

      summary += `${outcome} Call lasted ${durationText}.`;

      return summary;
    } catch (error) {
      console.error("Error generating basic summary:", error);
      return `Call from ${callLog.callerNumber} - ${
        callLog.transcript.length
      } messages exchanged. Call lasted ${callLog.duration || 0} seconds.`;
    }
  }

  // Extract caller name from messages
  static extractCallerName(callerMessages) {
    for (const msg of callerMessages) {
      const text = msg.text.toLowerCase();
      // Look for name patterns
      const namePatterns = [
        /मेरा नाम ([^\s]+) है/,
        /my name is ([^\s]+)/i,
        /i am ([^\s]+)/i,
        /this is ([^\s]+)/i,
      ];

      for (const pattern of namePatterns) {
        const match = text.match(pattern);
        if (match) {
          return match[1].charAt(0).toUpperCase() + match[1].slice(1);
        }
      }
    }
    return null;
  }

  // Extract detailed purpose from caller messages
  static extractDetailedPurpose(callerMessages) {
    if (!callerMessages.length) return "Caller contacted for unknown reason.";

    const allMessages = callerMessages
      .map((m) => m.text.toLowerCase())
      .join(" ");

    if (allMessages.includes("delivery") || allMessages.includes("package")) {
      return "They inquired about a delivery or package.";
    } else if (
      allMessages.includes("otp") ||
      allMessages.includes("code") ||
      allMessages.includes("verification")
    ) {
      return "They requested an OTP or verification code.";
    } else if (
      allMessages.includes("talk to") ||
      allMessages.includes("बात कर")
    ) {
      return "They wanted to speak with Ruchit directly.";
    } else if (
      allMessages.includes("call back") ||
      allMessages.includes("call कर")
    ) {
      return "They requested a callback from Ruchit.";
    } else if (
      allMessages.includes("message") ||
      allMessages.includes("tell")
    ) {
      return "They wanted to leave a message for Ruchit.";
    }
    return "They made a general inquiry.";
  }

  // Extract what assistance was provided
  static extractAssistanceProvided(aiMessages, callerMessages) {
    const aiText = aiMessages.map((m) => m.text.toLowerCase()).join(" ");
    const callerText = callerMessages
      .map((m) => m.text.toLowerCase())
      .join(" ");

    if (aiText.includes("otp") || aiText.includes("code")) {
      return "The AI assistant provided OTP information.";
    } else if (
      aiText.includes("callback") ||
      aiText.includes("call you back")
    ) {
      return "The AI assistant arranged for a callback.";
    } else if (aiText.includes("message") && callerText.includes("message")) {
      return "The AI assistant took a message for Ruchit.";
    } else if (aiText.includes("information") || aiText.includes("details")) {
      return "The AI assistant gathered information and provided assistance.";
    }
    return "The AI assistant provided general assistance.";
  }

  // Extract detailed outcome from AI messages
  static extractDetailedOutcome(aiMessages) {
    if (!aiMessages.length) return "No response was provided.";

    const lastMessage =
      aiMessages[aiMessages.length - 1]?.text?.toLowerCase() || "";
    const allMessages = aiMessages.map((m) => m.text.toLowerCase()).join(" ");

    if (
      lastMessage.includes("goodbye") ||
      lastMessage.includes("have a great day")
    ) {
      return "The call ended politely with assistance provided.";
    } else if (
      allMessages.includes("call you back") ||
      allMessages.includes("callback")
    ) {
      return "A callback was arranged and the call ended successfully.";
    } else if (
      allMessages.includes("message") &&
      allMessages.includes("make sure")
    ) {
      return "The message was recorded and the call ended successfully.";
    } else if (lastMessage.includes("thank")) {
      return "The call ended with thanks and assistance completed.";
    }
    return "The call ended after providing assistance.";
  }

  // Extract purpose from caller messages
  static extractPurpose(callerMessages) {
    if (!callerMessages.length) return "Caller contacted for unknown reason.";

    const firstMessage = callerMessages[0]?.text?.toLowerCase() || "";
    if (firstMessage.includes("delivery") || firstMessage.includes("package")) {
      return "Caller inquired about delivery.";
    } else if (firstMessage.includes("otp") || firstMessage.includes("code")) {
      return "Caller requested OTP/verification code.";
    } else if (
      firstMessage.includes("help") ||
      firstMessage.includes("support")
    ) {
      return "Caller sought assistance.";
    }
    return "General inquiry from caller.";
  }

  // Extract outcome from AI messages
  static extractOutcome(aiMessages) {
    if (!aiMessages.length) return "No response provided.";

    const lastMessage =
      aiMessages[aiMessages.length - 1]?.text?.toLowerCase() || "";
    if (lastMessage.includes("goodbye") || lastMessage.includes("bye")) {
      return "Call ended successfully.";
    } else if (lastMessage.includes("otp") || lastMessage.includes("code")) {
      return "OTP information was provided.";
    }
    return "Assistance was provided.";
  }

  // Format transcript into readable text for AI processing
  static formatTranscriptForSummary(transcript) {
    if (!transcript || transcript.length === 0) return "";

    return transcript
      .map((entry) => {
        const speaker = entry.speaker === "caller" ? "Caller" : "AI Assistant";
        const timestamp = new Date(entry.timestamp).toLocaleTimeString();
        return `[${timestamp}] ${speaker}: ${entry.text}`;
      })
      .join("\n");
  }

  // Get summary for a specific call
  static async getCallSummary(callSid) {
    try {
      const callLog = await CallLog.findOne({ callSid })
        .select(
          "summary summaryGeneratedAt summaryError transcript callerNumber startTime duration"
        )
        .populate("userId", "name")
        .lean();

      if (!callLog) {
        return { success: false, error: "Call not found" };
      }

      return {
        success: true,
        data: {
          callSid,
          summary: callLog.summary,
          summaryGeneratedAt: callLog.summaryGeneratedAt,
          summaryError: callLog.summaryError,
          hasTranscript: callLog.transcript && callLog.transcript.length > 0,
          transcriptLength: callLog.transcript?.length || 0,
          callerNumber: callLog.callerNumber,
          userName: callLog.userId?.name,
          startTime: callLog.startTime,
          duration: callLog.duration,
        },
      };
    } catch (error) {
      console.error("Error fetching call summary:", error);
      return { success: false, error: error.message };
    }
  }

  // Bulk generate summaries for calls missing summaries
  static async generateMissingSummaries(limit = 10) {
    try {
      console.log("🔍 Looking for calls missing summaries...");

      const callsWithoutSummary = await CallLog.find({
        summary: { $exists: false },
        transcript: { $exists: true, $not: { $size: 0 } },
        summaryError: { $exists: false }, // Don't retry failed attempts
      })
        .select("callSid")
        .limit(limit)
        .lean();

      console.log(
        `📊 Found ${callsWithoutSummary.length} calls needing summaries`
      );

      const results = [];

      for (const call of callsWithoutSummary) {
        console.log(`⏳ Processing summary for ${call.callSid}...`);
        const result = await this.generateCallSummary(call.callSid);
        results.push(result);

        // Add delay between requests to avoid overwhelming the AI service
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      const successful = results.filter((r) => r?.success).length;
      console.log(
        `✅ Generated summaries for ${successful}/${results.length} calls`
      );

      return {
        success: true,
        processed: results.length,
        successful: successful,
        results: results,
      };
    } catch (error) {
      console.error("Error in bulk summary generation:", error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = SummaryService;
