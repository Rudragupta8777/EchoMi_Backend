const axios = require('axios');
const { sendOTPApprovalRequest } = require('./fcmService');

class SMSVerificationService {
  constructor() {
    this.pendingApprovals = new Map();
  }

  async checkForOTP(userId, company, callSid = null) {
    try {
      console.log(`[SMS SERVICE] Checking for ${company} OTP for user ${userId} - fetching latest messages`);
      
      // Try to fetch the most recent SMS messages for this user (not just this call)
      try {
        const smsEndpoint = `${process.env.SMS_ENDPOINT_URL || 'http://localhost:3000'}/api/sms/call/latest`;
        console.log(`[SMS SERVICE] Fetching latest SMS from: ${smsEndpoint}`);
        
        const requestBody = {
          userId: userId,  // Fetch by userId to get all recent messages for this user
          limit: 50,      // Increased limit to get more recent messages
          forceFresh: true // Request fresh data from mobile app if needed
        };
        
        const smsResponse = await axios.post(smsEndpoint, requestBody);

        if (smsResponse.data.success && smsResponse.data.data && smsResponse.data.data.length > 0) {
          console.log(`[SMS SERVICE] ✅ Fetched ${smsResponse.data.data.length} SMS messages for user`);
          
          // Log the timestamps of the latest messages to verify freshness
          const latest5 = smsResponse.data.data.slice(0, 5);
          console.log(`[SMS SERVICE] 📅 Latest 5 message timestamps:`);
          latest5.forEach((msg, idx) => {
            console.log(`[SMS SERVICE]   ${idx + 1}. ${new Date(msg.timestamp).toLocaleString()} - ${msg.sender}: "${msg.message.substring(0, 50)}..."`);
          });
          
          const otpResult = this.extractOTPFromMessages(smsResponse.data.data, company);
          
          if (otpResult.found) {
            console.log(`[SMS SERVICE] 🎯 Found real OTP for ${company}: ${otpResult.otp}`);
            return {
              found: true,
              otp: otpResult.otp,
              trackingRequired: true,
              message: `Found real ${company} OTP: ${otpResult.otp}`,
              source: 'database'
            };
          }
        }
        
        console.log(`[SMS SERVICE] ❌ No OTP found in SMS messages`);
        return {
          found: false,
          otp: null,
          trackingRequired: false,
          message: `No real OTP found for ${company}`,
          source: 'none'
        };
      } catch (smsError) {
        console.error(`[SMS SERVICE]  Error fetching real SMS: ${smsError.message}`);
        return {
          found: false,
          otp: null,
          trackingRequired: false,
          message: `Error fetching OTP for ${company}`,
          source: 'error'
        };
      }
      
    } catch (error) {
      console.error('[SMS SERVICE] Critical error:', error);
      return {
        found: false,
        otp: null,
        trackingRequired: false,
        message: 'Error checking for OTP'
      };
    }
  }



  extractOTPFromMessages(messages, company) {
    try {
      if (!messages || !Array.isArray(messages)) {
        return { found: false, otp: null };
      }
      
      const companyLower = company?.toLowerCase() || '';
      console.log(`[SMS SERVICE] Looking for ${companyLower} OTP in ${messages.length} messages`);
      
      // Sort messages by timestamp descending to prioritize most recent messages
      const sortedMessages = messages.sort((a, b) => {
        const timeA = new Date(a.timestamp);
        const timeB = new Date(b.timestamp);
        return timeB - timeA; // Newest first
      });
      console.log(`[SMS SERVICE] 📅 Sorted ${sortedMessages.length} messages by timestamp (newest first)`);
      
      // Track all potential OTPs found to prioritize by recency and company match
      const foundOTPs = [];
      
      for (const message of sortedMessages) {
        const messageText = message.message?.toLowerCase() || '';
        const sender = message.sender?.toLowerCase() || '';
        
        console.log(`[SMS SERVICE] Checking message from ${message.sender}: "${message.message?.substring(0, 80)}${message.message?.length > 80 ? '...' : ''}"`);
        console.log(`[SMS SERVICE]   📅 Timestamp: ${new Date(message.timestamp).toLocaleString()}`);
        
        // Enhanced company matching patterns - STRICT matching to prevent cross-company confusion
        const isRelevantMessage = 
          messageText.includes(companyLower) || 
          sender.includes(companyLower) ||
          
          // Flipkart specific patterns
          (companyLower === 'flipkart' && (
            sender.includes('fk-') ||
            sender.includes('flipkar') ||
            sender.includes('fk') ||
            messageText.includes('fk-') ||
            messageText.includes('flipkar') ||
            (messageText.includes('delivery') && (messageText.includes('flipkart') || sender.includes('flipkart'))) ||
            (messageText.includes('order') && (messageText.includes('flipkart') || sender.includes('flipkart')))
          )) ||
          
          // Swiggy specific patterns  
          (companyLower === 'swiggy' && (
            (messageText.includes('delivery') && (messageText.includes('swiggy') || sender.includes('swiggy'))) ||
            (messageText.includes('order') && (messageText.includes('swiggy') || sender.includes('swiggy')))
          )) ||
          
          // Amazon specific patterns
          (companyLower === 'amazon' && (
            (messageText.includes('delivery') && (messageText.includes('amazon') || sender.includes('amazon'))) ||
            (messageText.includes('order') && (messageText.includes('amazon') || sender.includes('amazon'))) ||
            sender.includes('amzn') ||
            messageText.includes('amzn')
          )) ||
          
          // Zomato specific patterns
          (companyLower === 'zomato' && (
            (messageText.includes('food') && (messageText.includes('zomato') || sender.includes('zomato'))) ||
            (messageText.includes('order') && (messageText.includes('zomato') || sender.includes('zomato')))
          ));
        
        if (isRelevantMessage) {
          console.log(`[SMS SERVICE]  ✅ Relevant ${company} message found from ${message.sender}`);
          console.log(`[SMS SERVICE]  📱 Full message: "${message.message}"`);
          
          // Enhanced OTP patterns - prioritize explicit OTP mentions
          const otpPatterns = [
            // Explicit OTP patterns (highest priority) - company-specific
            new RegExp(`${companyLower}.*otp[:\\s\\-]*(\\d{4,8})`, 'i'),
            new RegExp(`otp.*${companyLower}[:\\s\\-]*(\\d{4,8})`, 'i'),
            /otp[:\s\-]*(?:is[\s]*)?([\d]{4,8})/i,
            /(?:otp|code)[:\s\-]*([\d]{4,8})/i,
            /delivery[\s]*otp[:\s\-]*([\d]{4,8})/i,
            
            // Standard patterns
            /verification[:\s\-]*([\d]{4,8})/i,
            /pin[:\s\-]*([\d]{4,8})/i,
            
            // Reverse patterns with explicit keywords
            /([\d]{4,8})[\s]*(?:is[\s]*(?:your[\s]*)?(?:otp|code|pin))/i,
            
            // Last resort - generic patterns (only for known delivery messages)
            /\b([\d]{4,6})\b/g
          ];
          
          for (const pattern of otpPatterns) {
            const match = messageText.match(pattern);
            if (match && match[1]) {
              const potentialOTP = match[1];
              // Validate OTP - should be 4-8 digits and not look like phone/year/time
              if (potentialOTP.length >= 4 && potentialOTP.length <= 8 && 
                  !potentialOTP.startsWith('20') && // Not a year
                  !potentialOTP.startsWith('19') && // Not a year  
                  potentialOTP !== '1234' && // Not a test pattern
                  potentialOTP !== '0000') {   // Not a null pattern
                
                // Store potential OTP with priority scoring
                const priority = this.calculateOTPPriority(pattern, messageText, potentialOTP, message.timestamp);
                foundOTPs.push({
                  otp: potentialOTP,
                  message: message.message,
                  sender: message.sender,
                  timestamp: message.timestamp,
                  priority: priority
                });
                
                console.log(`[SMS SERVICE]  🔍 Found potential OTP "${potentialOTP}" (priority: ${priority}) from ${new Date(message.timestamp).toLocaleString()}`);
                break; // Move to next message after finding first OTP in this message
              }
            }
          }
        } else {
          // For debugging - check if message contains any digits that could be OTPs
          const hasDigits = /\d{4,6}/.test(messageText);
          if (hasDigits) {
            console.log(`[SMS SERVICE]  ⚠️  Message has digits but not flagged as relevant: "${message.message?.substring(0, 100)}"`);
          }
        }
      }
      
      // If we found multiple OTPs, return the highest priority one
      if (foundOTPs.length > 0) {
        const bestOTP = foundOTPs.sort((a, b) => b.priority - a.priority)[0];
        console.log(`[SMS SERVICE] 🎯 SELECTED BEST OTP: "${bestOTP.otp}" from ${new Date(bestOTP.timestamp).toLocaleString()} (priority: ${bestOTP.priority})`);
        console.log(`[SMS SERVICE] 🏆 Total OTPs found: ${foundOTPs.length}, selected highest priority`);
        
        return { 
          found: true, 
          otp: bestOTP.otp, 
          message: bestOTP.message,
          sender: bestOTP.sender,
          timestamp: bestOTP.timestamp
        };
      }
      
      console.log(`[SMS SERVICE] ❌ No OTP found in ${messages.length} messages for ${company}`);
      return { found: false, otp: null };
    } catch (error) {
      console.error('[SMS SERVICE] OTP extraction error:', error);
      return { found: false, otp: null };
    }
  }

  // Calculate OTP priority based on pattern match and recency
  calculateOTPPriority(pattern, messageText, otp, timestamp) {
    let priority = 0;
    
    // Recency score (newer messages get higher priority)
    const now = new Date();
    const messageTime = new Date(timestamp);
    const ageMinutes = (now - messageTime) / (1000 * 60);
    const recencyScore = Math.max(0, 100 - ageMinutes); // 100 for immediate, decreases with age
    
    // Pattern specificity score
    if (pattern.source.includes('otp')) priority += 50;
    if (pattern.source.includes('delivery')) priority += 30;
    if (pattern.source.includes('verification')) priority += 20;
    
    // OTP length score (6 digits is most common)
    if (otp.length === 6) priority += 20;
    else if (otp.length === 4) priority += 15;
    
    return priority + recencyScore;
  }

  // Extract tracking IDs from SMS messages
  extractTrackingFromMessages(messages, company) {
    try {
      if (!messages || !Array.isArray(messages)) {
        return { found: false, trackingIds: [] };
      }
      
      const companyLower = company?.toLowerCase() || '';
      const trackingIds = [];
      
      console.log(`[SMS SERVICE] Looking for ${companyLower} tracking IDs in ${messages.length} messages`);
      
      for (const message of messages) {
        const messageText = message.message?.toLowerCase() || '';
        const sender = message.sender?.toLowerCase() || '';
        
        // Check if message is from the relevant company
        const isRelevantMessage = 
          messageText.includes(companyLower) || 
          sender.includes(companyLower) ||
          (companyLower === 'swiggy' && (messageText.includes('delivery') || messageText.includes('order'))) ||
          (companyLower === 'amazon' && messageText.includes('delivery')) ||
          (companyLower === 'zomato' && (messageText.includes('food') || messageText.includes('order'))) ||
          messageText.includes('tracking') || messageText.includes('order');
        
        if (isRelevantMessage) {
          console.log(`[SMS SERVICE]  Checking for tracking ID in message from ${message.sender}: "${messageText}"`);
          
          // Tracking ID patterns for different companies
          const trackingPatterns = [
            // Amazon patterns
            /order[#\s-]*([A-Z0-9]{10,})/i,
            /tracking[#\s-]*([A-Z0-9]{8,})/i,
            /reference[#\s-]*([A-Z0-9]{8,})/i,
            
            // Swiggy patterns
            /order[#\s-]*(\d{8,})/i,
            /delivery[#\s-]*(\d{8,})/i,
            /transaction[#\s\-:]*(\d{8,})/i,  // Added for Swiggy transaction IDs
            
            // Zomato patterns
            /order[#\s-]*([A-Z0-9]{6,})/i,
            
            // Generic patterns
            /\b([A-Z]{2}\d{8,})\b/g,  // Like AB12345678
            /\b(\d{10,})\b/g,         // Long numbers
            /\b([A-Z0-9]{8,})\b/g     // Alphanumeric codes
          ];
          
          for (const pattern of trackingPatterns) {
            const matches = messageText.match(pattern);
            if (matches) {
              console.log(`[SMS SERVICE]    Pattern matched: ${pattern} → ${matches[1]}`);
              if (pattern.global) {
                // For global patterns, get all matches
                const allMatches = [...messageText.matchAll(pattern)];
                for (const match of allMatches) {
                  if (match[1] && match[1].length >= 6) {
                    trackingIds.push(match[1].toUpperCase());
                    console.log(`[SMS SERVICE]    Added tracking ID: ${match[1].toUpperCase()}`);
                  }
                }
              } else {
                // For non-global patterns, get first match
                if (matches[1] && matches[1].length >= 6) {
                  trackingIds.push(matches[1].toUpperCase());
                  console.log(`[SMS SERVICE]    Added tracking ID: ${matches[1].toUpperCase()}`);
                }
              }
            }
          }
        }
      }
      
      // Remove duplicates and filter valid tracking IDs
      const uniqueTrackingIds = [...new Set(trackingIds)].filter(id => 
        id.length >= 6 && id.length <= 20 && !/^\d{4}$|^\d{6}$/.test(id) // Exclude OTPs
      );
      
      console.log(`[SMS SERVICE]  Found tracking IDs: ${uniqueTrackingIds.join(', ')}`);
      
      return {
        found: uniqueTrackingIds.length > 0,
        trackingIds: uniqueTrackingIds
      };
      
    } catch (error) {
      console.error('[SMS SERVICE] Error extracting tracking IDs:', error);
      return { found: false, trackingIds: [] };
    }
  }

  // Verify if provided tracking ID matches any in SMS
  async verifyTrackingId(providedTrackingId, company, callSid) {
    try {
      console.log(`[TRACKING VERIFICATION] Verifying tracking ID: "${providedTrackingId}" for ${company}`);
      
      if (!callSid) {
        console.error('[TRACKING VERIFICATION] ❌ No callSid provided for verification');
        return {
          verified: false,
          message: "I don't have the delivery information. Let me send a notification for approval."
        };
      }
      
      // Fetch SMS messages for this call
      const smsEndpoint = `${process.env.SMS_ENDPOINT_URL || 'http://localhost:3000'}/api/sms/call/latest`;
      const smsResponse = await axios.post(smsEndpoint, {
        callSid: callSid,
        limit: 20
      });

      if (smsResponse.data.success && smsResponse.data.data && smsResponse.data.data.length > 0) {
        const trackingResult = this.extractTrackingFromMessages(smsResponse.data.data, company);
        
        if (trackingResult.found) {
          console.log(`[TRACKING VERIFICATION] Found tracking IDs in SMS: ${trackingResult.trackingIds.join(', ')}`);
          
          // Check if provided tracking ID matches any extracted tracking ID
          // Normalize provided tracking ID - remove all non-alphanumeric characters
          const providedNormalized = providedTrackingId.replace(/[^A-Z0-9]/gi, '').toUpperCase();
          console.log(`[TRACKING VERIFICATION] Normalized provided ID: "${providedNormalized}"`);
          console.log(`[TRACKING VERIFICATION] Comparing provided: "${providedTrackingId}" (normalized: "${providedNormalized}") with extracted: [${trackingResult.trackingIds.join(', ')}]`);
          
          const isMatch = trackingResult.trackingIds.some(id => {
            const extractedNormalized = id.replace(/[^A-Z0-9]/gi, '').toUpperCase();
            console.log(`[TRACKING VERIFICATION] Comparing "${providedNormalized}" with "${extractedNormalized}"`);
            return extractedNormalized === providedNormalized || 
                   extractedNormalized.includes(providedNormalized) || 
                   providedNormalized.includes(extractedNormalized);
          });
          
          console.log(`[TRACKING VERIFICATION] Match result: ${isMatch}`);
          
          if (isMatch) {
            console.log(`[TRACKING VERIFICATION] ✅ Tracking ID verified successfully`);
            return {
              verified: true,
              message: "Tracking ID verified successfully!"
            };
          } else {
            console.log(`[TRACKING VERIFICATION] ❌ Tracking ID does not match. Expected: ${trackingResult.trackingIds.join(' or ')}`);
            return {
              verified: false,
              message: "The tracking ID you provided doesn't match our records. Please check and try again."
            };
          }
        } else {
          console.log(`[TRACKING VERIFICATION] ❌ No tracking IDs found in SMS messages`);
          return {
            verified: false,
            message: "I couldn't find any tracking information in the messages. Let me send a notification for manual approval."
          };
        }
      } else {
        console.log(`[TRACKING VERIFICATION] ❌ No SMS messages found for verification`);
        return {
          verified: false,
          message: "I don't have the delivery information. Let me send a notification for approval."
        };
      }
      
    } catch (error) {
      console.error('[TRACKING VERIFICATION] Error verifying tracking ID:', error);
      return {
        verified: false,
        message: "I'm having trouble verifying the tracking ID. Let me send a notification for manual approval."
      };
    }
  }

  async requestUserApproval(userId, fcmToken, company, callerNumber, callSid) {
    try {
      const approvalId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`[APPROVAL REQUEST] 🔍 Creating approval request: ${approvalId} for ${company}`);
      console.log(`[APPROVAL REQUEST] 📱 FCM Token available: ${fcmToken ? 'Yes' : 'No'}`);
      console.log(`[APPROVAL REQUEST] 📞 Caller: ${callerNumber}, CallSid: ${callSid}`);
      
      // Store the approval request
      this.pendingApprovals.set(approvalId, {
        userId, company, callerNumber, callSid,
        status: 'pending', timestamp: Date.now(), fcmToken
      });
      
      console.log(`[APPROVAL REQUEST] 🔔 Sending FCM notification for ${company} OTP approval...`);
      
      // Send the actual FCM notification
      const fcmResult = await sendOTPApprovalRequest(fcmToken, {
        company: company,
        callerNumber: callerNumber,
        callSid: callSid,
        approvalId: approvalId
      });
      
      console.log(`[APPROVAL REQUEST] ✅ FCM notification sent successfully:`, fcmResult);
      return { 
        sent: true, 
        approvalId, 
        message: `Approval request sent for ${company} OTP`,
        fcmResponse: fcmResult 
      };
      
    } catch (error) {
      console.error(`[APPROVAL REQUEST] ❌ Failed to send FCM approval notification:`, error);
      console.error(`[APPROVAL REQUEST] Error details:`, {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      return { 
        sent: false, 
        error: error.message,
        message: `Failed to send approval request for ${company} OTP` 
      };
    }
  }

  async processUserResponse(approvalId, approved, userId = null) {
    const request = this.pendingApprovals.get(approvalId);
    if (!request || request.status !== 'pending') {
      return { success: false, message: 'Request not found or expired', action: 'not_found' };
    }
    
    request.status = approved ? 'approved' : 'rejected';
    return {
      success: true,
      message: `OTP sharing ${request.status} for ${request.company}`,
      action: request.status,
      company: request.company
    };
  }

  getPendingApproval(callSid) {
    for (const [approvalId, request] of this.pendingApprovals.entries()) {
      if (request.callSid === callSid && request.status === 'pending') {
        return { pending: true, approvalId, company: request.company };
      }
    }
    return { pending: false, approvalId: null, company: null };
  }

  getApprovalStatus(approvalId) {
    const request = this.pendingApprovals.get(approvalId);
    if (!request) return { found: false };
    
    const expired = (Date.now() - request.timestamp) > (5 * 60 * 1000);
    return {
      found: true,
      status: request.status,
      approved: request.status === 'approved',
      expired,
      timestamp: new Date(request.timestamp),
      company: request.company
    };
  }

  getPendingApprovalByApprovalId(approvalId) {
    const request = this.pendingApprovals.get(approvalId);
    if (!request) {
      console.log(`[SMS SERVICE] No pending approval found for: ${approvalId}`);
      return null;
    }
    
    return {
      approvalId: approvalId,
      company: request.company,
      callSid: request.callSid,
      userId: request.userId,
      timestamp: request.timestamp
    };
  }
}

module.exports = new SMSVerificationService();
