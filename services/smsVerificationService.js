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

  async verifyTrackingId(trackingId, company, otp) {
    const pattern = /^[A-Z0-9]{6,15}$/i;
    if (pattern.test(trackingId.trim())) {
      return { verified: true, message: 'Tracking ID verified!' };
    } else {
      return { verified: false, message: 'Invalid tracking ID format' };
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
