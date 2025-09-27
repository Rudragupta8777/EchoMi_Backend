const mongoose = require('mongoose');
const Sms = require('./models/Sms');
require('dotenv').config();

async function checkCurrentOTPs() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/echomi');
    console.log('✅ Connected to MongoDB');
    
    // Get recent SMS messages with potential OTPs
    const recentSms = await Sms.find({}).sort({ timestamp: -1 }).limit(20);
    console.log(`📧 Checking latest ${recentSms.length} SMS messages:`);
    
    recentSms.forEach((msg, index) => {
      const text = (msg.message || '').toLowerCase();
      const hasOTP = /\b\d{4,8}\b/.test(msg.message);
      
      if (hasOTP || text.includes('swiggy') || text.includes('flipkart')) {
        console.log(`\n📱 Message ${index + 1}:`);
        console.log(`   Sender: ${msg.sender}`);
        console.log(`   Content: ${msg.message}`);
        console.log(`   Time: ${new Date(msg.timestamp).toLocaleString()}`);
        console.log(`   CallSid: ${msg.callSid}`);
        
        // Extract potential OTPs
        const otpMatches = msg.message.match(/\b\d{4,8}\b/g);
        if (otpMatches) {
          console.log(`   🔢 Potential OTPs: ${otpMatches.join(', ')}`);
        }
        
        // Check company
        if (text.includes('swiggy')) console.log(`   🍔 SWIGGY MESSAGE`);
        if (text.includes('flipkart')) console.log(`   🛍️ FLIPKART MESSAGE`);
      }
    });
    
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkCurrentOTPs();