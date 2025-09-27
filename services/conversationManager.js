/**
 * Active Conversations Manager
 * Tracks WebSocket connections and conversation states for OTP approval resume functionality
 */

class ConversationManager {
  constructor() {
    this.activeConversations = new Map();
  }

  /**
   * Store active conversation by callSid
   * @param {string} callSid - Twilio call ID
   * @param {object} conversation - Conversation state object including WebSocket
   */
  storeActiveConversation(callSid, conversation) {
    this.activeConversations.set(callSid, conversation);
    console.log(`[CONVERSATION MANAGER] ✅ Stored conversation for call: ${callSid}`);
    console.log(`[CONVERSATION MANAGER] 📊 Total active conversations: ${this.activeConversations.size}`);
  }

  /**
   * Retrieve active conversation by callSid
   * @param {string} callSid - Twilio call ID
   * @returns {object|null} - Conversation state object or null if not found
   */
  getActiveConversationByCallSid(callSid) {
    const conversation = this.activeConversations.get(callSid);
    if (!conversation) {
      console.log(`[CONVERSATION MANAGER] ❌ No conversation found for call: ${callSid}`);
      console.log(`[CONVERSATION MANAGER] 📊 Active conversations: [${Array.from(this.activeConversations.keys()).join(', ')}]`);
    } else {
      console.log(`[CONVERSATION MANAGER] ✅ Found conversation for call: ${callSid}`);
    }
    return conversation;
  }

  /**
   * Remove conversation when call ends
   * @param {string} callSid - Twilio call ID
   */
  removeActiveConversation(callSid) {
    const existed = this.activeConversations.delete(callSid);
    if (existed) {
      console.log(`[CONVERSATION MANAGER] ✅ Removed conversation for call: ${callSid}`);
    } else {
      console.log(`[CONVERSATION MANAGER] ⚠️ Tried to remove non-existent conversation: ${callSid}`);
    }
    console.log(`[CONVERSATION MANAGER] 📊 Remaining active conversations: ${this.activeConversations.size}`);
  }

  /**
   * Get all active conversation IDs for debugging
   * @returns {string[]} - Array of active callSids
   */
  getActiveConversationIds() {
    return Array.from(this.activeConversations.keys());
  }

  /**
   * Clean up expired conversations (older than 2 hours)
   */
  cleanupExpiredConversations() {
    const now = Date.now();
    const expiredCalls = [];
    
    for (const [callSid, conversation] of this.activeConversations.entries()) {
      // Check if conversation has been active for more than 2 hours
      const conversationAge = now - (conversation.startTime || now);
      if (conversationAge > 2 * 60 * 60 * 1000) { // 2 hours
        expiredCalls.push(callSid);
      }
    }
    
    expiredCalls.forEach(callSid => {
      this.removeActiveConversation(callSid);
      console.log(`[CONVERSATION MANAGER] 🧹 Cleaned up expired conversation: ${callSid}`);
    });
    
    return expiredCalls.length;
  }
}

// Export singleton instance
const conversationManager = new ConversationManager();

// Set up periodic cleanup (every 30 minutes)
setInterval(() => {
  const cleaned = conversationManager.cleanupExpiredConversations();
  if (cleaned > 0) {
    console.log(`[CONVERSATION MANAGER] 🧹 Cleaned up ${cleaned} expired conversations`);
  }
}, 30 * 60 * 1000); // 30 minutes

module.exports = conversationManager;