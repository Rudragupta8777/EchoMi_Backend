const axios = require('axios');
const { translateText } = require('./translationService'); // translation service

class TtsService {
  constructor() {
    this.isSpeaking = false;
    this.speechQueue = [];
    // Hybrid TTS configuration
    this.deepgramConfig = {
      models: {
        en: 'aura-asteria-en',
        es: 'aura-asteria-es',
        fr: 'aura-asteria-fr',
        default: 'aura-asteria-en'
      },
      encoding: 'mulaw',
      sample_rate: 8000
    };
    this.openaiConfig = {
      model: 'tts-1',
      voice: 'nova',
      response_format: 'pcm'
    };
    // Pre-compute µ-law lookup table for OpenAI conversion
    this.mulawTable = this.buildMulawTable();
  }

  /**
   * Pre-build µ-law conversion lookup table for OpenAI audio processing
   */
  buildMulawTable() {
    const table = new Array(65536);
    for (let i = 0; i < 65536; i++) {
      const sample = i - 32768; // Convert to signed 16-bit
      table[i] = this.linearToMulaw(sample);
    }
    return table;
  }

  /**
   * Convert linear PCM sample to µ-law
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
   * Convert OpenAI PCM16 audio to µ-law format for Twilio
   */
  convertPcmToMulaw(pcm16Buffer) {
    const outputSize = Math.floor(pcm16Buffer.length / 6); // Downsample 24kHz->8kHz
    const mulawBuffer = Buffer.alloc(outputSize);
    
    // Downsample and convert in single pass
    for (let i = 0, j = 0; j < outputSize; i += 6, j++) {
      const sample = pcm16Buffer.readInt16LE(i) + 32768; // Convert to unsigned
      mulawBuffer[j] = this.mulawTable[sample & 0xFFFF];
    }
    
    return mulawBuffer;
  }

  /**
   * Main TTS function - Hybrid approach: Deepgram for English, OpenAI for Hindi
   * @param {string} text - Text to speak
   * @param {string} lang - Target language (e.g., "en", "hi")
   */
  async textToSpeech(text, lang = "en") {
    if (!text || text.trim().length === 0) {
      console.log('[TTS] No text provided');
      return null;
    }

    try {
      console.log(`[TTS] Converting text to speech: "${text}" in [${lang}]`);
      const startTime = Date.now();

      // Route to appropriate TTS service based on language
      if (lang === 'hi' || lang === 'hi-IN') {
        return await this.generateOpenAITTS(text, startTime);
      } else {
        return await this.generateDeepgramTTS(text, lang, startTime);
      }
    } catch (error) {
      console.error('[TTS] Error generating speech:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Generate TTS using Deepgram (for English and other languages)
   */
  async generateDeepgramTTS(text, lang, startTime) {
    console.log(`[TTS] Using Deepgram for language: ${lang}`);
    
    const model = this.deepgramConfig.models[lang] || this.deepgramConfig.models['default'];
    
    const response = await axios.post(
      'https://api.deepgram.com/v1/speak',
      { text: text },
      {
        headers: {
          'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: {
          model: model,
          encoding: this.deepgramConfig.encoding,
          sample_rate: this.deepgramConfig.sample_rate
        },
        responseType: 'arraybuffer',
        timeout: 5000
      }
    );

    const audioBase64 = Buffer.from(response.data).toString('base64');
    const totalTime = Date.now() - startTime;
    console.log(`[TTS] Deepgram TTS completed in ${totalTime}ms - Size: ${audioBase64.length} chars`);
    
    return audioBase64;
  }

  /**
   * Generate TTS using OpenAI (for Hindi)
   */
  async generateOpenAITTS(text, startTime) {
    console.log(`[TTS] Using OpenAI for Hindi text`);
    
    const apiStart = Date.now();
    const response = await axios.post(
      'https://api.openai.com/v1/audio/speech',
      {
        model: this.openaiConfig.model,
        input: text,
        voice: this.openaiConfig.voice,
        response_format: this.openaiConfig.response_format,
        speed: 1.0
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer',
        timeout: 15000 // OpenAI takes longer
      }
    );
    console.log(`[TTS] OpenAI API took: ${Date.now() - apiStart}ms`);

    // Convert OpenAI PCM to µ-law for Twilio
    const processStart = Date.now();
    const pcm16Buffer = Buffer.from(response.data);
    const mulawBuffer = this.convertPcmToMulaw(pcm16Buffer);
    const audioBase64 = mulawBuffer.toString('base64');
    console.log(`[TTS] Audio processing took: ${Date.now() - processStart}ms`);
    
    const totalTime = Date.now() - startTime;
    console.log(`[TTS] OpenAI TTS completed in ${totalTime}ms - PCM: ${pcm16Buffer.length} bytes, µ-law: ${mulawBuffer.length} bytes`);
    
    return audioBase64;
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
