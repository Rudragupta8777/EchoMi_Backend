const axios = require('axios');

class SMSVerificationService {
  constructor() {
    this.pendingApprovals = new Map();
  }

  async checkForOTP(userId, company, callSid = null) {
    try {
      console.log(`[SMS SERVICE] Checking for ${company} OTP for user ${userId} - fetching from database`);
      
      // Try to fetch real SMS messages from database first
      try {
        const smsEndpoint = `${process.env.SMS_ENDPOINT_URL || 'http://localhost:3000'}/api/sms/call/latest`;
        console.log(`[SMS SERVICE] Fetching SMS from: ${smsEndpoint}`);
        
        const requestBody = {
          limit: 15
        };
        
        // If we have callSid, use it for precise lookup
        if (callSid) {
          requestBody.callSid = callSid;
        } else {
          // Fallback to user ID if no callSid
          requestBody.userId = userId;
        }
        
        const smsResponse = await axios.post(smsEndpoint, requestBody);

        if (smsResponse.data.success && smsResponse.data.data && smsResponse.data.data.length > 0) {
          console.log(`[SMS SERVICE]  Fetched ${smsResponse.data.data.length} real SMS messages from database`);
          
          const otpResult = this.extractOTPFromMessages(smsResponse.data.data, company);
          
          if (otpResult.found) {
            console.log(`[SMS SERVICE]  Found real OTP for ${company}: ${otpResult.otp}`);
            return {
              found: true,
              otp: otpResult.otp,
              trackingRequired: true,
              message: `Found real ${company} OTP: ${otpResult.otp}`,
              source: 'database'
            };
          }
        }
        
        console.log(`[SMS SERVICE]  No OTP found in real SMS messages, falling back to simulation`);
      } catch (smsError) {
        console.error(`[SMS SERVICE]  Error fetching real SMS: ${smsError.message}`);
        console.log('[SMS SERVICE] Falling back to simulated OTPs');
      }
      
      // Fallback to simulated OTPs for development
      return this.checkSimulatedOTP(company);
      
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

  checkSimulatedOTP(company) {
    const simulatedOTPs = {
      'Amazon': '123456',
      'Flipkart': '789012', 
      'Zomato': '345678',
      'Swiggy': '982784'
    };

    const foundOTP = simulatedOTPs[company] || simulatedOTPs[company?.toLowerCase()];
      
    if (foundOTP) {
      console.log(`[SMS SERVICE]  Found simulated OTP for ${company}: ${foundOTP}`);
      return {
        found: true,
        otp: foundOTP,
        trackingRequired: true,
        message: `Found simulated ${company} OTP: ${foundOTP}`,
        source: 'simulation'
      };
    } else {
      return {
        found: false,
        otp: null,
        trackingRequired: false,
        message: `No OTP found for ${company}`
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
      
      for (const message of messages) {
        const messageText = message.message?.toLowerCase() || '';
        const sender = message.sender?.toLowerCase() || '';
        
        console.log(`[SMS SERVICE] Checking message from ${message.sender}: "${message.message?.substring(0, 50)}..."`);
        
        const isRelevantMessage = 
          messageText.includes(companyLower) || 
          sender.includes(companyLower) ||
          (companyLower === 'swiggy' && (messageText.includes('delivery') || messageText.includes('order'))) ||
          (companyLower === 'amazon' && messageText.includes('delivery')) ||
          (companyLower === 'zomato' && (messageText.includes('food') || messageText.includes('order')));
        
        if (isRelevantMessage) {
          console.log(`[SMS SERVICE]  Relevant message found from ${message.sender}`);
          
          const otpPatterns = [
            /otp[:\s-]*(\d{4,8})/i,
            /code[:\s-]*(\d{4,8})/i,
            /verification[:\s-]*(\d{4,8})/i,
            /pin[:\s-]*(\d{4,8})/i,
            /\b(\d{4,8})\s*(?:is your|otp|code|pin)/i,
            /\b(\d{6})\b/g
          ];
          
          for (const pattern of otpPatterns) {
            const match = messageText.match(pattern);
            if (match && match[1]) {
              console.log(`[SMS SERVICE]  OTP FOUND: "${match[1]}" using pattern: ${pattern}`);
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
      console.error('[SMS SERVICE] OTP extraction error:', error);
      return { found: false, otp: null };
    }
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
    const approvalId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.pendingApprovals.set(approvalId, {
      userId, company, callerNumber, callSid,
      status: 'pending', timestamp: Date.now(), fcmToken
    });
    
    return { sent: true, approvalId, message: `Approval request sent for ${company} OTP` };
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
}

module.exports = new SMSVerificationService();
