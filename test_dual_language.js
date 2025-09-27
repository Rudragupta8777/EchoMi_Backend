const { textToSpeech } = require('./services/ttsService');

async function testDualLanguageTTS() {
  console.log('🎯 Testing Dual Language TTS Integration...\n');
  
  // Test English (should use Deepgram)
  console.log('📧 Testing English TTS (Deepgram)...');
  const englishText = "Hello, I found your Flipkart delivery OTP: 1-2-3-4-5-6";
  try {
    const englishAudio = await textToSpeech(englishText, 'en');
    console.log(`✅ English TTS successful: ${englishAudio ? 'Audio generated' : 'Failed'}`);
  } catch (error) {
    console.error('❌ English TTS failed:', error.message);
  }
  
  console.log('');
  
  // Test Hindi (should use OpenAI)  
  console.log('📧 Testing Hindi TTS (OpenAI)...');
  const hindiText = "आपका फ्लिपकार्ट डिलीवरी OTP है: एक-दो-तीन-चार-पांच-छह";
  try {
    const hindiAudio = await textToSpeech(hindiText, 'hi-IN');
    console.log(`✅ Hindi TTS successful: ${hindiAudio ? 'Audio generated' : 'Failed'}`);
  } catch (error) {
    console.error('❌ Hindi TTS failed:', error.message);
  }
  
  console.log('\n🎉 Dual language TTS test completed!');
}

// Test language detection
function testLanguageDetection() {
  console.log('\n🔍 Testing Language Detection...\n');
  
  // Enhanced Hindi detection patterns
  const hindiPattern = /[\u0900-\u097F]/;
  const hindiWords = /\b(है|हैं|मेरे|मेरा|पास|का|के|की|में|से|को|ने|और|यह|वह|आप|हम|तुम|हो|होगा|करना|करे|जी|हाँ|नहीं|क्या|कैसे|कहाँ|कब|डिलीवरी|पैकेज)\b/;
  const romanHindi = /\b(hai|mere|mera|kar|karo|delivery|package|aap|hum|kya|kaise|kahan|nahi|ji|haan)\b/i;
  
  const detectLanguage = (text) => {
    if (hindiPattern.test(text)) return 'hi';
    if (hindiWords.test(text)) return 'hi';
    const romanHindiMatches = text.match(romanHindi);
    if (romanHindiMatches && romanHindiMatches.length >= 2) return 'hi';
    return 'en';
  };
  
  const testCases = [
    // English test cases
    { text: "I have a delivery from Flipkart", expected: 'en' },
    { text: "Hello, do you need the OTP?", expected: 'en' },
    
    // Hindi (Devanagari) test cases
    { text: "मेरे पास फ्लिपकार्ट की डिलीवरी है", expected: 'hi' },
    { text: "क्या आपको OTP चाहिए?", expected: 'hi' },
    { text: "जी हाँ, मेरे पास डिलीवरी है", expected: 'hi' },
    
    // Romanized Hindi test cases
    { text: "mere paas delivery hai aap ke liye", expected: 'hi' },
    { text: "ji haan package hai", expected: 'hi' },
    
    // Mixed cases
    { text: "delivery hai mere paas", expected: 'hi' },
    { text: "I need help", expected: 'en' }
  ];
  
  testCases.forEach((testCase, index) => {
    const detected = detectLanguage(testCase.text);
    const status = detected === testCase.expected ? '✅' : '❌';
    console.log(`${status} Test ${index + 1}: "${testCase.text}" → ${detected} (expected: ${testCase.expected})`);
  });
}

// Run tests
testLanguageDetection();
testDualLanguageTTS();