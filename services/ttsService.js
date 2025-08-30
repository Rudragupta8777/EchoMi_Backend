const axios = require('axios');

class TtsService {
  constructor() {
    this.isSpeaking = false;
    this.speechQueue = [];
  }

  async textToSpeech(text) {
    if (!text || text.trim().length === 0) {
      console.log('[TTS] No text provided');
      return null;
    }

    try {
      console.log(`[TTS] Converting text to speech: "${text}"`);
      
      // Using Deepgram TTS API
      const response = await axios.post(
        'https://api.deepgram.com/v1/speak',
        {
          text: text
        },
        {
          headers: {
            'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
            'Content-Type': 'application/json'
          },
          params: {
            model: 'aura-asteria-en', // Natural sounding voice
            encoding: 'mulaw',
            sample_rate: 8000
          },
          responseType: 'arraybuffer'
        }
      );

      // Convert to base64 for Twilio
      const audioBase64 = Buffer.from(response.data).toString('base64');
      console.log(`[TTS] Audio generated successfully (${audioBase64.length} chars)`);
      
      return audioBase64;

    } catch (error) {
      console.error('[TTS] Error generating speech:', error.response?.data || error.message);
      
      // Fallback to a simple text-to-speech alternative or return null
      return null;
    }
  }

  // Alternative method using ElevenLabs (if you prefer)
  async textToSpeechElevenLabs(text, voiceId = 'pNInz6obpgDQGcFmaJgB') {
    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text: text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5
          }
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': process.env.ELEVENLABS_API_KEY
          },
          responseType: 'arraybuffer'
        }
      );

      return Buffer.from(response.data).toString('base64');
    } catch (error) {
      console.error('[TTS] ElevenLabs error:', error.response?.data || error.message);
      return null;
    }
  }

  // Queue management for multiple speech requests
  async queueSpeech(text) {
    return new Promise((resolve) => {
      this.speechQueue.push({ text, resolve });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isSpeaking || this.speechQueue.length === 0) {
      return;
    }

    this.isSpeaking = true;
    const { text, resolve } = this.speechQueue.shift();

    try {
      const audio = await this.textToSpeech(text);
      resolve(audio);
    } catch (error) {
      console.error('[TTS] Queue processing error:', error);
      resolve(null);
    }

    this.isSpeaking = false;
    
    // Process next item in queue after a short delay
    setTimeout(() => this.processQueue(), 100);
  }
}

// Export singleton instance and the class
const ttsService = new TtsService();

module.exports = {
  TtsService,
  textToSpeech: (text) => ttsService.textToSpeech(text),
  queueSpeech: (text) => ttsService.queueSpeech(text)
};