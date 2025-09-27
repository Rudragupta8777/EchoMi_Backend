const mongoose = require('mongoose');
const Sms = require('./models/Sms');
require('dotenv').config();

async function addFlipkartSMS() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/echomi');
    console.log('✅ Connected to MongoDB');
    
    // Create sample Flipkart SMS messages
    const flipkartSmsMessages = [
      {
        userId: '68d71bdde5cae18c8ebea3ae', // Your user ID from the logs
        callSid: 'CA988f02bd570e2ba79f7f1ba405837e2f', // Current call ID from logs
        phoneNumber: '+919876543210',
        message: 'Your Flipkart order #FKD123456789 is out for delivery. OTP: 567890. Share this OTP with delivery partner.',
        sender: 'FK-FLIPKR',
        timestamp: new Date(),
        smsType: 'inbox',
        storageType: 'regular',
        isProcessed: false
      },
      {
        userId: '68d71bdde5cae18c8ebea3ae',
        callSid: 'CA988f02bd570e2ba79f7f1ba405837e2f',
        phoneNumber: '+919876543210', 
        message: 'Hi, your Flipkart package is ready for delivery. Delivery OTP is 234567. Please share with delivery executive.',
        sender: 'FLIPKART',
        timestamp: new Date(Date.now() - 300000), // 5 minutes ago
        smsType: 'inbox',
        storageType: 'regular',
        isProcessed: false
      },
      {
        userId: '68d71bdde5cae18c8ebea3ae',
        callSid: 'CA988f02bd570e2ba79f7f1ba405837e2f',
        phoneNumber: '+919876543210',
        message: 'Your order FKO789123456 from Flipkart will be delivered today. Use OTP 678901 for delivery verification.',
        sender: 'FK-NOREPL',
        timestamp: new Date(Date.now() - 600000), // 10 minutes ago
        smsType: 'inbox',
        storageType: 'regular',
        isProcessed: false
      }
    ];
    
    // Insert the SMS messages
    const insertedMessages = await Sms.insertMany(flipkartSmsMessages);
    console.log(`✅ Added ${insertedMessages.length} Flipkart SMS messages:`);
    
    insertedMessages.forEach((msg, index) => {
      console.log(`\n📱 Message ${index + 1}:`);
      console.log(`   Sender: ${msg.sender}`);
      console.log(`   Content: ${msg.message}`);
      
      // Extract OTP
      const otpMatch = msg.message.match(/\b\d{4,8}\b/g);
      if (otpMatch) {
        console.log(`   🔢 OTP Found: ${otpMatch.join(', ')}`);
      }
    });
    
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    console.log('\n🎉 Test your Flipkart delivery call now - it should find real OTPs!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addFlipkartSMS();