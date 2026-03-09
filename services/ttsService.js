const axios = require("axios");
const { translateText } = require("./translationService"); // translation service

/**
 * TTS Service - Sarvam AI Text-to-Speech
 *
 * Uses Sarvam AI for both English and Hindi with native Indian voices
 *
 * Voice Options (Available Speakers):
 * Female: anushka, manisha, vidya, arya, ritu, priya, neha, pooja, simran, kavya,
 *         ishita, shreya, roopa, tanya, shruti, suhani, kavitha, rupali, amelia, sophia
 * Male: abhilash, karun, hitesh, aditya, rahul, rohan, amit, dev, ratan, varun,
 *       manan, sumit, kabir, aayan, shubh, ashutosh, advait, anand, tarun, sunny,
 *       mani, gokul, vijay, mohit, rehan, soham
 *
 * Model: bulbul:v3 (latest stable version)
 *
 * To change voice: Update this.sarvamConfig.speakers in constructor below
 */

class TtsService {
  constructor() {
    this.isSpeaking = false;
    this.speechQueue = [];
    // Sarvam AI TTS configuration
    this.sarvamConfig = {
      apiEndpoint: "https://api.sarvam.ai/text-to-speech",
      model: "bulbul:v3",
      speakers: {
        hi: "shreya", // Female voice for Hindi - Clear and professional
        en: "shreya", // Using same voice for English
        // Other female options: "vidya", "neha", "ishita", "priya", "manisha", "kavya"
        // Male options: "amit", "rohan", "dev", "rahul", "mohit", "varun", "shubh"
      },
      pace: 0.90, // Slower pace for clearer delivery and better comprehension
      speech_sample_rate: 8000, // 8kHz for Twilio compatibility
      enable_preprocessing: true, // Enhanced clarity and noise reduction
      // Note: pitch and loudness are NOT supported in bulbul:v3
    };
    // Pre-compute µ-law lookup table for audio conversion
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
    let exponent = this.linearSearch(
      sample >> 7,
      [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40],
    );
    let mantissa = (sample >> (exponent + 3)) & 0x0f;

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
   * Convert PCM16 audio to µ-law format for Twilio (without downsampling)
   * Used for Sarvam AI audio which is already at 8kHz
   */
  convertPcmToMulawSimple(pcm16Buffer) {
    const outputSize = Math.floor(pcm16Buffer.length / 2); // 2 bytes per sample
    const mulawBuffer = Buffer.alloc(outputSize);
    const volumeGain = 0.1; // Reduce volume by 40% to prevent loud output

    // Convert each 16-bit PCM sample to µ-law with volume reduction
    for (let i = 0, j = 0; i < pcm16Buffer.length - 1; i += 2, j++) {
      const originalSample = pcm16Buffer.readInt16LE(i);
      // Apply volume gain and convert to unsigned
      const reducedSample = Math.round(originalSample * volumeGain) + 32768;
      mulawBuffer[j] = this.mulawTable[reducedSample & 0xffff];
    }

    return mulawBuffer;
  }

  /**
   * Convert OpenAI PCM16 audio to µ-law format for Twilio
   * Used for OpenAI audio which needs downsampling from 24kHz to 8kHz
   */
  convertPcmToMulaw(pcm16Buffer) {
    const outputSize = Math.floor(pcm16Buffer.length / 6); // Downsample 24kHz->8kHz
    const mulawBuffer = Buffer.alloc(outputSize);
    const volumeGain = 0.6; // Reduce volume by 40% to prevent loud output

    // Downsample and convert in single pass with volume reduction
    for (let i = 0, j = 0; j < outputSize; i += 6, j++) {
      const originalSample = pcm16Buffer.readInt16LE(i);
      // Apply volume gain and convert to unsigned
      const reducedSample = Math.round(originalSample * volumeGain) + 32768;
      mulawBuffer[j] = this.mulawTable[reducedSample & 0xffff];
    }

    return mulawBuffer;
  }

  /**
   * Main TTS function - Uses Sarvam AI for both English and Hindi
   * @param {string} text - Text to speak
   * @param {string} lang - Target language (e.g., "en", "hi")
   */
  async textToSpeech(text, lang = "en") {
    if (!text || text.trim().length === 0) {
      console.log("[TTS] No text provided");
      return null;
    }

    try {
      console.log(`[TTS] Converting text to speech: "${text}" in [${lang}]`);
      const startTime = Date.now();

      // Use Sarvam AI for both English and Hindi
      return await this.generateSarvamTTS(text, lang, startTime);
    } catch (error) {
      console.error(
        "[TTS] Error generating speech:",
        error.response?.data || error.message,
      );
      return null;
    }
  }

  /**
   * Generate TTS using Sarvam AI (for both English and Hindi)
   */
  async generateSarvamTTS(text, lang, startTime) {
    console.log(`[TTS] Using Sarvam AI for language: ${lang}`);

    // Map language codes to Sarvam AI format
    const languageCode = lang === "hi" || lang === "hi-IN" ? "hi-IN" : "en-IN";
    const baseLang = lang === "hi" || lang === "hi-IN" ? "hi" : "en";
    const speaker = this.sarvamConfig.speakers[baseLang];

    const apiStart = Date.now();
    const response = await axios.post(
      this.sarvamConfig.apiEndpoint,
      {
        inputs: [text],
        target_language_code: languageCode,
        speaker: speaker,
        pace: this.sarvamConfig.pace,
        speech_sample_rate: this.sarvamConfig.speech_sample_rate,
        enable_preprocessing: this.sarvamConfig.enable_preprocessing,
        model: this.sarvamConfig.model,
      },
      {
        headers: {
          "api-subscription-key": process.env.SARVAM_API_KEY,
          "Content-Type": "application/json",
        },
        responseType: "json",
        timeout: 15000,
      },
    );
    console.log(`[TTS] Sarvam AI API took: ${Date.now() - apiStart}ms`);

    // Sarvam AI returns base64 encoded PCM audio - convert to µ-law for Twilio
    const processStart = Date.now();
    let audioBase64;

    if (
      response.data &&
      response.data.audios &&
      response.data.audios.length > 0
    ) {
      const sarvamAudioBase64 = response.data.audios[0];

      // Decode base64 to PCM buffer
      const pcmBuffer = Buffer.from(sarvamAudioBase64, "base64");

      // Convert PCM to µ-law for Twilio compatibility
      const mulawBuffer = this.convertPcmToMulawSimple(pcmBuffer);
      audioBase64 = mulawBuffer.toString("base64");

      console.log(
        `[TTS] Audio processing took: ${Date.now() - processStart}ms`,
      );
      console.log(
        `[TTS] PCM: ${pcmBuffer.length} bytes → µ-law: ${mulawBuffer.length} bytes`,
      );
    } else {
      throw new Error("No audio data received from Sarvam AI");
    }

    const totalTime = Date.now() - startTime;
    console.log(
      `[TTS] Sarvam AI TTS completed in ${totalTime}ms - Size: ${audioBase64.length} chars`,
    );

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
      console.error("[TTS] Queue processing error:", error);
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
  queueSpeech: (text, lang = "en") => ttsService.queueSpeech(text, lang),
};
