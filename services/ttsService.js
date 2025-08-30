const axios = require('axios');
const { translateText } = require('./translationService'); // translation service

class TtsService {
  constructor() {
    this.isSpeaking = false;
    this.speechQueue = [];
    // Language fallback map for Deepgram TTS voices
    this.languageModelMap = {
      en: 'aura-asteria-en',
      es: 'aura-asteria-es',
      fr: 'aura-asteria-fr',
      hi: 'aura-asteria-en', // fallback to English
      de: 'aura-asteria-en', // fallback to English
      default: 'aura-asteria-en'
    };
  }

  /**
   * Main TTS function
   * @param {string} text - Text to speak
   * @param {string} lang - Target language (e.g., "en", "es", "hi")
   */
  async textToSpeech(text, lang = "en") {
    let localizedText = text;
    if (lang !== "en") {
        // only translate if your system response is in English and you want to convert
        localizedText = await translateText(text, lang, "en");
    }
    if (!text || text.trim().length === 0) {
      console.log('[TTS] No text provided');
      return null;
    }

    try {
      console.log(`[TTS] Converting text to speech: "${text}" in [${lang}]`);

      // 1️⃣ Translate text if needed
      let localizedText = text;
      if (lang !== "en") {
        localizedText = await translateText(text, lang, "en");
        console.log(`[TTS] Translated to ${lang}: "${localizedText}"`);
      }

      // 2️⃣ Pick Deepgram model based on language
      const model = this.languageModelMap[lang] || this.languageModelMap['default'];

      // 3️⃣ Call Deepgram TTS API
      const response = await axios.post(
        'https://api.deepgram.com/v1/speak',
        { text: localizedText },
        {
          headers: {
            'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
            'Content-Type': 'application/json'
          },
          params: {
            model: model,
            encoding: 'mulaw',
            sample_rate: 8000
          },
          responseType: 'arraybuffer'
        }
      );

      // 4️⃣ Convert to base64 for Twilio streaming
      const audioBase64 = Buffer.from(response.data).toString('base64');
      console.log(`[TTS] Audio generated successfully (${audioBase64.length} chars)`);

      return audioBase64;
    } catch (error) {
      console.error('[TTS] Error generating speech:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Add text to speech queue
   * @param {string} text 
   * @param {string} lang 
   */
  async queueSpeech(text, lang = "en") {
    return new Promise((resolve) => {
      this.speechQueue.push({ text, lang, resolve });
      this.processQueue();
    });
  }

  /**
   * Process queued TTS requests
   */
  async processQueue() {
    if (this.isSpeaking || this.speechQueue.length === 0) return;

    this.isSpeaking = true;
    const { text, lang, resolve } = this.speechQueue.shift();

    try {
      const audio = await this.textToSpeech(text, lang);
      resolve(audio);
    } catch (error) {
      console.error('[TTS] Queue processing error:', error);
      resolve(null);
    }

    this.isSpeaking = false;
    setTimeout(() => this.processQueue(), 100);
  }
}

// Export singleton instance
const ttsService = new TtsService();

module.exports = {
  TtsService,
  textToSpeech: (text, lang = "en") => ttsService.textToSpeech(text, lang),
  queueSpeech: (text, lang = "en") => ttsService.queueSpeech(text, lang)
};
