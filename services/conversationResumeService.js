const conversationManager = require('../services/conversationManager');
const smsVerificationService = require('../services/smsVerificationService');
const CallLog = require('../models/CallLog');

/**
 * Resume conversation after OTP approval and share the OTP
 * @param {string} approvalId - The approval request ID
 * @param {string} company - The company name (Swiggy, Amazon, etc.)
 */
async function resumeConversationAfterApproval(approvalId, company) {
  try {
    console.log(`[CONVERSATION RESUME] 🔄 Resuming conversation for approval: ${approvalId}`);
    
    // Find the pending approval and get the callSid
    const approval = smsVerificationService.getPendingApprovalByApprovalId(approvalId);
    if (!approval) {
      console.error(`[CONVERSATION RESUME] ❌ No pending approval found for: ${approvalId}`);
      return { success: false, error: 'Approval not found' };
    }
    
    const { callSid, userId } = approval;
    console.log(`[CONVERSATION RESUME] 📞 Found call: ${callSid}, user: ${userId}`);
    
    // Find the active conversation for this call
    const conversation = conversationManager.getActiveConversationByCallSid(callSid);
    if (!conversation) {
      console.error(`[CONVERSATION RESUME] ❌ No active conversation found for call: ${callSid}`);
      console.error(`[CONVERSATION RESUME] 📊 Available conversations: [${conversationManager.getActiveConversationIds().join(', ')}]`);
      return { success: false, error: 'Active conversation not found' };
    }
    
    console.log(`[CONVERSATION RESUME] ✅ Resuming conversation for call: ${callSid}`);
    
    // Check if we have an OTP from the conversation state
    let otp = conversation.found_otp;
    
    // If no OTP in conversation state, try to fetch it again
    if (!otp) {
      console.log(`[CONVERSATION RESUME] 🔍 No OTP in conversation state, fetching from SMS...`);
      const otpResult = await smsVerificationService.checkForOTP(userId, company, callSid);
      
      if (otpResult.found) {
        otp = otpResult.otp;
        conversation.found_otp = otp; // Store it for future use
        console.log(`[CONVERSATION RESUME] ✅ Found OTP: ${otp}`);
      } else {
        console.error(`[CONVERSATION RESUME] ❌ No OTP found for ${company}`);
        const errorMessage = `I apologize, but I couldn't find the O T P for ${company}. Please try the delivery again or contact customer support.`;
        await conversation.safeSendAudioResponse(errorMessage);
        return { success: false, error: 'OTP not found' };
      }
    }
    
    if (otp) {
      console.log(`[CONVERSATION RESUME] 🎯 Sharing OTP: ${otp} for ${company}`);
      
      // Create the OTP message with proper formatting
      const otpMessage = `Thank you for your approval! The O T P for ${company} is: ${formatOtpDigits(otp)}. Please use this O T P to complete the delivery. Have a great day!`;
      
      // Send the OTP to the caller
      await conversation.safeSendAudioResponse(otpMessage);
      
      // Update conversation state
      conversation.conversation_stage = 'otp_provided';
      conversation.current_intent = 'otp_shared';
      
      // Add to chat history
      conversation.chatHistory.push({
        role: "assistant", 
        content: otpMessage
      });
      
      console.log(`[CONVERSATION RESUME] ✅ OTP shared successfully for ${company}`);
      
      // End the call after a delay to allow the message to be heard
      setTimeout(() => {
        endCallGracefully(callSid, conversation);
      }, 8000); // 8 seconds delay for longer message
      
      return { success: true, message: `OTP shared for ${company}` };
      
    } else {
      console.error(`[CONVERSATION RESUME] ❌ No OTP available for call: ${callSid}`);
      const errorMessage = "I'm sorry, but I couldn't find the O T P. Please try the delivery again.";
      await conversation.safeSendAudioResponse(errorMessage);
      return { success: false, error: 'OTP not available' };
    }
    
  } catch (error) {
    console.error('[CONVERSATION RESUME] ❌ Error resuming conversation:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Format OTP digits for better audio pronunciation
 * @param {string} otp - The OTP to format
 * @returns {string} - Formatted OTP with word representations
 */
function formatOtpDigits(otp) {
  const digitWords = {
    '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
    '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine'
  };
  
  return otp.split('').map(digit => digitWords[digit] || digit).join(', ');
}

/**
 * End call gracefully with proper cleanup
 * @param {string} callSid - Twilio call ID
 * @param {object} conversation - Conversation state object
 */
async function endCallGracefully(callSid, conversation) {
  try {
    console.log(`[CALL END] 🔚 Ending call gracefully: ${callSid}`);
    
    // Update call log in database
    if (callSid) {
      await CallLog.findOneAndUpdate(
        { callSid: callSid },
        {
          status: 'completed',
          endTime: new Date(),
          conversationHistory: conversation.chatHistory || []
        }
      );
      console.log(`[CALL END] ✅ Updated call log for: ${callSid}`);
    }
    
    // Send hangup command to Twilio WebSocket
    if (conversation.ws && conversation.ws.readyState === conversation.ws.OPEN) {
      const hangupMessage = JSON.stringify({ action: 'hangup' });
      conversation.ws.send(hangupMessage);
      console.log(`[CALL END] 📞 Sent hangup command for: ${callSid}`);
      
      // Close WebSocket connection after a brief delay
      setTimeout(() => {
        if (conversation.ws && conversation.ws.readyState === conversation.ws.OPEN) {
          conversation.ws.close();
          console.log(`[CALL END] 🔌 Closed WebSocket for: ${callSid}`);
        }
      }, 1000);
    }
    
    // Remove from active conversations
    conversationManager.removeActiveConversation(callSid);
    
    console.log(`[CALL END] ✅ Call ended gracefully: ${callSid}`);
    
  } catch (error) {
    console.error(`[CALL END] ❌ Error ending call ${callSid}:`, error);
  }
}

module.exports = {
  resumeConversationAfterApproval,
  formatOtpDigits,
  endCallGracefully
};