const mongoose = require('mongoose');
const Sms = require('./models/Sms');
require('dotenv').config();

async function checkDatabaseDirectly() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/echomi');
    console.log('✅ Connected to MongoDB');
    
    // Get all SMS messages
    const allSms = await Sms.find({}).sort({ timestamp: -1 }).limit(50);
    console.log(`📧 Found ${allSms.length} total SMS messages in database`);
    
    // Filter for potential Flipkart or delivery messages
    const deliveryMessages = allSms.filter(msg => {
      const text = (msg.message || '').toLowerCase();
      const sender = (msg.sender || '').toLowerCase();
      
      return text.includes('flipkart') || 
             sender.includes('flipkart') ||
             sender.includes('fk-') ||
             text.includes('delivery') ||
             text.includes('order') ||
             text.includes('otp') ||
             text.includes('code') ||
             /\b\d{4,8}\b/.test(text); // Has 4-8 digit numbers
    });
    
    console.log(`🎯 Found ${deliveryMessages.length} potential delivery/OTP messages:`);
    
    deliveryMessages.slice(0, 15).forEach((msg, index) => {
      console.log(`\n📱 Message ${index + 1}:`);
      console.log(`   Sender: ${msg.sender}`);
      console.log(`   CallSid: ${msg.callSid}`);
      console.log(`   Content: ${msg.message}`);
      console.log(`   Time: ${new Date(msg.timestamp).toLocaleString()}`);
      
      // Check for OTP patterns
      const otpMatch = msg.message.match(/\b\d{4,8}\b/g);
      if (otpMatch) {
        console.log(`   🔢 Potential OTPs: ${otpMatch.join(', ')}`);
      }
    });
    
    // Check for Flipkart specifically
    const flipkartMessages = allSms.filter(msg => {
      const text = (msg.message || '').toLowerCase();
      const sender = (msg.sender || '').toLowerCase();
      
      return text.includes('flipkart') || sender.includes('flipkart') || sender.includes('fk-');
    });
    
    console.log(`\n🛍️ Flipkart specific messages: ${flipkartMessages.length}`);
    flipkartMessages.forEach((msg, index) => {
      console.log(`\n🛍️ Flipkart Message ${index + 1}:`);
      console.log(`   Sender: ${msg.sender}`);
      console.log(`   Content: ${msg.message}`);
      
      // Check for OTP patterns
      const otpMatch = msg.message.match(/\b\d{4,8}\b/g);
      if (otpMatch) {
        console.log(`   🔢 OTPs: ${otpMatch.join(', ')}`);
      }
    });
    
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkDatabaseDirectly();