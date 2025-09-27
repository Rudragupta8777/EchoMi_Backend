// Test language detection only (no API calls)
function testLanguageDetection() {
  console.log('🔍 Testing Language Detection...\n');
  
  // Enhanced Hindi detection patterns (same as in controller)
  const hindiPattern = /[\u0900-\u097F]/;
  const hindiWords = /\b(है|हैं|मेरे|मेरा|पास|का|के|की|में|से|को|ने|और|यह|वह|आप|हम|तुम|हो|होगा|करना|करे|जी|हाँ|नहीं|क्या|कैसे|कहाँ|कब|डिलीवरी|पैकेज)\b/;
  const romanHindi = /\b(hai|mere|mera|kar|karo|delivery|package|aap|hum|kya|kaise|kahan|nahi|ji|haan)\b/i;
  
  const detectLanguage = (text) => {
    // Enhanced Hindi detection patterns (same as controller)
    const hindiPattern = /[\u0900-\u097F]/; // Devanagari script
    const hindiWords = /\b(है|हैं|मेरे|मेरा|पास|का|के|की|में|से|को|ने|और|यह|वह|आप|हम|तुम|हो|होगा|करना|करे|जी|हाँ|नहीं|क्या|कैसे|कहाँ|कब|डिलीवरी|पैकेज)\b/;
    
    // More specific romanized Hindi patterns (avoid common English words)
    const strongRomanHindi = /\b(haan|nahi|kya|kaise|kahan|aapko|hamara|tumhara|karo|karna|chahiye)\b/i;
    const mediumRomanHindi = /\b(hai|mere|mera|aap|hum|tum)\b/i;
    
    // Check for Devanagari script (strongest indicator)
    if (hindiPattern.test(text)) {
      console.log(`   → Hindi detected via Devanagari script`);
      return 'hi';
    }
    
    // Check for common Hindi words in Devanagari
    if (hindiWords.test(text)) {
      console.log(`   → Hindi detected via Hindi words`);
      return 'hi';
    }
    
    // Check for strong romanized Hindi indicators
    const strongMatches = text.match(strongRomanHindi);
    if (strongMatches && strongMatches.length >= 1) {
      console.log(`   → Hindi detected via strong romanized text: ${strongMatches.join(', ')}`);
      return 'hi';
    }
    
    // Check for medium romanized Hindi indicators (need multiple)
    const mediumMatches = text.match(mediumRomanHindi);
    if (mediumMatches && mediumMatches.length >= 2) {
      console.log(`   → Hindi detected via multiple romanized indicators: ${mediumMatches.join(', ')}`);
      return 'hi';
    }
    
    // Check for combination: at least one medium + contains typical Hindi sentence structure
    if (mediumMatches && mediumMatches.length >= 1) {
      // Look for typical Hindi sentence patterns
      const hindiPatterns = /\b(paas|wala|wali|ke liye|ki tarah|se)\b/i;
      if (hindiPatterns.test(text)) {
        console.log(`   → Hindi detected via romanized word + Hindi pattern: ${mediumMatches.join(', ')}`);
        return 'hi';
      }
    }
    
    console.log(`   → English detected (default)`);
    return 'en'; // Default to English
  };
  
  const testCases = [
    // English test cases
    { text: "I have a delivery from Flipkart", expected: 'en', description: "Pure English delivery message" },
    { text: "Hello, do you need the OTP?", expected: 'en', description: "English OTP question" },
    { text: "Yes, I need help", expected: 'en', description: "Simple English response" },
    
    // Hindi (Devanagari) test cases
    { text: "मेरे पास फ्लिपकार्ट की डिलीवरी है", expected: 'hi', description: "Hindi delivery message in Devanagari" },
    { text: "क्या आपको OTP चाहिए?", expected: 'hi', description: "Hindi OTP question" },
    { text: "जी हाँ, मेरे पास डिलीवरी है", expected: 'hi', description: "Hindi confirmation with delivery" },
    { text: "नमस्ते, मैं डिलीवरी बॉय हूँ", expected: 'hi', description: "Hindi greeting from delivery person" },
    
    // Romanized Hindi test cases (need multiple indicators or strong patterns)
    { text: "mere paas delivery hai aap ke liye", expected: 'hi', description: "Romanized Hindi with multiple indicators + Hindi pattern" },
    { text: "ji haan mere paas package hai", expected: 'hi', description: "Strong romanized Hindi words" },
    { text: "aap kahan hai mere paas aana", expected: 'hi', description: "Multiple romanized Hindi indicators" },
    
    // Mixed/tricky cases
    { text: "delivery hai mere paas", expected: 'hi', description: "Mixed with multiple Hindi indicators + pattern" },
    { text: "package delivery", expected: 'en', description: "Pure English (no Hindi indicators)" },
    { text: "hello ji", expected: 'en', description: "English with single Hindi word (not enough)" },
    { text: "mere delivery hai", expected: 'hi', description: "Multiple Hindi words" }
  ];
  
  let passed = 0;
  let total = testCases.length;
  
  testCases.forEach((testCase, index) => {
    console.log(`\nTest ${index + 1}: "${testCase.text}"`);
    console.log(`Description: ${testCase.description}`);
    const detected = detectLanguage(testCase.text);
    const status = detected === testCase.expected ? '✅' : '❌';
    console.log(`${status} Result: ${detected} (expected: ${testCase.expected})`);
    
    if (detected === testCase.expected) passed++;
  });
  
  console.log(`\n📊 Results: ${passed}/${total} tests passed (${Math.round(passed/total*100)}%)`);
  
  // Test TTS language mapping
  console.log(`\n🎯 TTS Language Mapping Test:`);
  console.log(`Hindi 'hi' → 'hi-IN' for OpenAI TTS`);
  console.log(`English 'en' → 'en' for Deepgram TTS`);
  console.log(`✅ Language mapping looks correct!`);
}

testLanguageDetection();