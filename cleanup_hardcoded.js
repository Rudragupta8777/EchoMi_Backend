const mongoose = require('mongoose');
const Sms = require('./models/Sms');
require('dotenv').config();

async function removeHardcodedFlipkartMessages() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/echomi');
    console.log('✅ Connected to MongoDB');
    
    // Remove the hardcoded Flipkart messages I added earlier
    const deleteResult = await Sms.deleteMany({
      sender: { $in: ['FK-FLIPKR', 'FLIPKART', 'FK-NOREPL'] }
    });
    
    console.log(`🗑️  Removed ${deleteResult.deletedCount} hardcoded Flipkart messages`);
    
    // Show current state
    const remainingOTPs = await Sms.find({
      $or: [
        { message: { $regex: /swiggy/i } },
        { message: { $regex: /flipkart/i } },
        { message: { $regex: /otp/i } },
        { message: { $regex: /\\b\\d{4,8}\\b/ } }
      ]
    }).sort({ timestamp: -1 }).limit(10);
    
    console.log(`\\n📧 Current OTP-related messages in database:`);
    remainingOTPs.forEach((msg, index) => {
      const otpMatches = msg.message.match(/\\b\\d{4,8}\\b/g);
      console.log(`\\n${index + 1}. From ${msg.sender}: "${msg.message}"`);
      console.log(`   CallSid: ${msg.callSid}`);
      if (otpMatches) {
        console.log(`   🔢 OTPs: ${otpMatches.join(', ')}`);
      }
    });
    
    await mongoose.connection.close();
    console.log('\\n✅ Database connection closed');
    console.log('\\n🎯 Now testing with only real messages from your database!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

removeHardcodedFlipkartMessages();