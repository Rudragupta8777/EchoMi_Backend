const axios = require('axios');

async function testUpdatedOTPFetching() {
  try {
    console.log('🔄 Testing updated OTP fetching system...');
    
    // Test the SMS endpoint with userId instead of callSid
    const testUserId = '68d71bdde5cae18c8ebea3ae'; // Your user ID from logs
    
    console.log(`\n📧 Testing SMS fetch for userId: ${testUserId}`);
    const response = await axios.post('http://localhost:3000/api/sms/call/latest', {
      userId: testUserId,
      limit: 30
    });
    
    if (response.data.success && response.data.data) {
      const messages = response.data.data;
      console.log(`✅ Successfully fetched ${messages.length} messages for user`);
      
      // Check what companies we have OTPs for
      const companies = ['Swiggy', 'Flipkart', 'Amazon'];
      
      for (const company of companies) {
        console.log(`\n🔍 Checking for ${company} OTPs:`);
        
        const companyMessages = messages.filter(msg => {
          const text = (msg.message || '').toLowerCase();
          const sender = (msg.sender || '').toLowerCase();
          
          return text.includes(company.toLowerCase()) || 
                 sender.includes(company.toLowerCase()) ||
                 (company === 'Swiggy' && (text.includes('delivery') || text.includes('order')));
        });
        
        if (companyMessages.length > 0) {
          console.log(`  📱 Found ${companyMessages.length} ${company} messages:`);
          companyMessages.forEach((msg, index) => {
            const otpMatch = msg.message.match(/\b\d{4,8}\b/g);
            console.log(`    ${index + 1}. ${new Date(msg.timestamp).toLocaleString()}: "${msg.message}"`);
            if (otpMatch) {
              console.log(`       🔢 OTP: ${otpMatch.join(', ')}`);
            }
          });
        } else {
          console.log(`  ❌ No ${company} messages found`);
        }
      }
      
    } else {
      console.log('❌ Failed to fetch SMS messages');
      console.log('Response:', response.data);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response?.data) {
      console.error('Error details:', error.response.data);
    }
  }
}

testUpdatedOTPFetching();