const axios = require('axios');

async function checkFlipkartSMS() {
  try {
    console.log('🔍 Checking for Flipkart SMS messages in database...');
    
    // Try different endpoints and methods
    const endpoints = [
      { url: 'http://localhost:3000/api/sms/call/latest', method: 'POST', body: { limit: 50 } },
      { url: 'http://localhost:3000/api/sms/latest', method: 'GET' },
      { url: 'http://localhost:3000/api/sms', method: 'GET' }
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`\n🔄 Trying ${endpoint.method} ${endpoint.url}...`);
        
        let response;
        if (endpoint.method === 'POST') {
          response = await axios.post(endpoint.url, endpoint.body);
        } else {
          response = await axios.get(endpoint.url);
        }
        
        if (response.data && (response.data.success || response.data.data || Array.isArray(response.data))) {
          const messages = response.data.data || response.data;
          console.log(`✅ Success! Found ${messages.length} total SMS messages`);
          
          // Filter for potential Flipkart messages
          const flipkartMessages = messages.filter(msg => {
            const text = (msg.message || '').toLowerCase();
            const sender = (msg.sender || '').toLowerCase();
            
            return text.includes('flipkart') || 
                   sender.includes('flipkart') ||
                   sender.includes('fk-') ||
                   sender.includes('flipkar') ||
                   text.includes('delivery') ||
                   text.includes('order') ||
                   /\b\d{4,6}\b/.test(text); // Has 4-6 digit numbers
          });
          
          console.log(`🎯 Found ${flipkartMessages.length} potential Flipkart/delivery messages:`);
          
          flipkartMessages.slice(0, 10).forEach((msg, index) => { // Show first 10
            console.log(`\n📱 Message ${index + 1}:`);
            console.log(`   Sender: ${msg.sender}`);
            console.log(`   Content: ${msg.message}`);
            console.log(`   Time: ${msg.timestamp ? new Date(msg.timestamp).toLocaleString() : 'N/A'}`);
            
            // Check for OTP patterns
            const otpMatch = msg.message.match(/\b\d{4,8}\b/g);
            if (otpMatch) {
              console.log(`   🔢 Potential OTPs: ${otpMatch.join(', ')}`);
            }
          });
          
          // Show all messages with any digits for debugging
          console.log(`\n🔢 All messages with digits:`);
          const messagesWithDigits = messages.filter(msg => /\d{4,8}/.test(msg.message)).slice(0, 5);
          messagesWithDigits.forEach((msg, index) => {
            console.log(`   ${index + 1}. From ${msg.sender}: "${msg.message}"`);
          });
          
          return; // Success, exit
        }
      } catch (endpointError) {
        console.log(`❌ Failed: ${endpointError.response?.status} ${endpointError.response?.statusText}`);
        if (endpointError.response?.data) {
          console.log(`   Error details:`, endpointError.response.data);
        }
      }
    }
    
    console.log('❌ All endpoints failed');
    
  } catch (error) {
    console.error('❌ General error:', error.message);
  }
}

checkFlipkartSMS();