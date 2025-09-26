const axios = require('axios');
const { translateText } = require('./translationService'); // translation service

class TtsService {
  constructor() {
    this.isSpeaking = false;
    this.speechQueue = [];
    // OpenAI TTS voice configuration optimized for Twilio
    this.voiceConfig = {
      model: "tts-1",
      voice: "alloy",
      response_format: "pcm" // Raw PCM16 format for audio processing
    };
  }

  /**
   * Convert PCM16 audio to µ-law format for Twilio
   * @param {Buffer} pcm16Buffer - PCM16 audio buffer from OpenAI
   * @returns {Buffer} - µ-law encoded audio buffer
   */
  convertToMulaw(pcm16Buffer) {
    // Simple downsample from 24kHz to 8kHz (take every 3rd sample)
    const downsampledBuffer = Buffer.alloc(Math.floor(pcm16Buffer.length / 3));
    for (let i = 0, j = 0; i < pcm16Buffer.length - 1; i += 6, j += 2) {
      downsampledBuffer.writeInt16LE(pcm16Buffer.readInt16LE(i), j);
    }

    // Convert PCM to µ-law
    const mulawBuffer = Buffer.alloc(downsampledBuffer.length / 2);
    for (let i = 0, j = 0; i < downsampledBuffer.length - 1; i += 2, j++) {
      const sample = downsampledBuffer.readInt16LE(i);
      mulawBuffer[j] = this.linearToMulaw(sample);
    }

    return mulawBuffer;
  }

  /**
   * Convert linear PCM sample to µ-law
   * @param {number} sample - 16-bit PCM sample
   * @returns {number} - µ-law encoded byte
   */
  linearToMulaw(sample) {
    const BIAS = 0x84;
    const CLIP = 32635;
    
    let sign = (sample >> 8) & 0x80;
    if (sign !== 0) sample = -sample;
    if (sample > CLIP) sample = CLIP;
    
    sample = sample + BIAS;
    let exponent = this.linearSearch(sample >> 7, [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40]);
    let mantissa = (sample >> (exponent + 3)) & 0x0F;
    
    return ~(sign | (exponent << 4) | mantissa);
  }

  /**
   * Helper function for µ-law encoding
   */
  linearSearch(val, table) {
    for (let i = 0; i < table.length; i++) {
      if (val <= table[i]) return i;
    }
    return table.length - 1;
  }

  /**
   * Main TTS function
   * @param {string} text - Text to speak
   * @param {string} lang - Target language (e.g., "en", "es", "hi")
   */
  async textToSpeech(text, lang = "en") {
    let localizedText = text;
    if (lang !== "en") {
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

      // 2️⃣ Call OpenAI TTS API with Twilio-optimized settings
      const response = await axios.post(
        'https://api.openai.com/v1/audio/speech',
        {
          model: this.voiceConfig.model,
          input: localizedText,
          voice: this.voiceConfig.voice,
          response_format: this.voiceConfig.response_format,
          // Optimize for telephony quality
          speed: 1.0
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );

      // 3️⃣ Process PCM16 audio and convert to µ-law for Twilio
      const pcm16Buffer = Buffer.from(response.data);
      const mulawBuffer = this.convertToMulaw(pcm16Buffer);
      const audioBase64 = mulawBuffer.toString('base64');
      
      console.log(`[TTS] OpenAI audio processed successfully - Original: ${pcm16Buffer.length} bytes, µ-law: ${mulawBuffer.length} bytes`);
      console.log(`[TTS] Format: PCM16→8kHz µ-law, Voice: ${this.voiceConfig.voice}`);

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
