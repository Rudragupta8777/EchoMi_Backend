const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const EventEmitter = require('events');

class SttService extends EventEmitter {
  constructor() {
    super();
    this.deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    this.isProcessing = false;
    this.transcriptBuffer = '';
    this.silenceTimer = null;
    this.lastTranscriptTime = 0;
    
    // Debounce settings
    this.SILENCE_THRESHOLD = 1500; // 1.5 seconds of silence before processing
    this.MIN_TRANSCRIPT_LENGTH = 3; // Minimum characters to process
    
    this.initConnection();
  }

  initConnection() {
    // Create connection with optimized settings for conversation
    this.connection = this.deepgram.listen.live({
      model: 'nova-3',
      smart_format: true,
      encoding: 'mulaw',
      language: 'multi',
      sample_rate: 8000,
      interim_results: true, // Keep this for responsiveness
      endpointing: 300, // Wait 300ms after speech ends
      utterance_end_ms: 1000, // Consider utterance ended after 1 second
      vad_events: true, // Voice activity detection
      filler_words: false, // Remove um, ah, etc.
      punctuate: true
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.connection.on(LiveTranscriptionEvents.Open, () => {
      console.log('[DEEPGRAM] Connection opened.');
    });

    this.connection.on(LiveTranscriptionEvents.Ready, () => {
      console.log('[DEEPGRAM] Connection is ready to receive audio.');
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      console.log('[DEEPGRAM] Connection closed.');
    });

    this.connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error('[DEEPGRAM] An error occurred:', error);
    });

    // Handle speech start/end events
    this.connection.on(LiveTranscriptionEvents.SpeechStarted, () => {
      console.log('[DEEPGRAM] Speech started - clearing any pending processing');
      this.clearSilenceTimer();
      this.isProcessing = false;
    });

    // Main transcript handler with improved logic
    this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      this.handleTranscript(data);
    });

    this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      console.log('[DEEPGRAM] Utterance ended');
      this.processBufferedTranscript();
    });
  }

  handleTranscript(data) {
    const transcript = data.channel.alternatives[0].transcript;
    const confidence = data.channel.alternatives[0].confidence || 0;
    const isFinal = data.is_final;
    
    // Skip low confidence or empty transcripts
    if (!transcript || confidence < 0.6) {
      return;
    }

    console.log(`[DEEPGRAM] Transcript: "${transcript}" | Final: ${isFinal} | Confidence: ${confidence}`);

    if (isFinal) {
      // Add to buffer and set up processing
      this.transcriptBuffer += ` ${transcript}`.trim();
      this.lastTranscriptTime = Date.now();
      
      // Clear any existing timer and set new one
      this.clearSilenceTimer();
      this.silenceTimer = setTimeout(() => {
        this.processBufferedTranscript();
      }, this.SILENCE_THRESHOLD);
    }
  }

  processBufferedTranscript() {
    const transcript = this.transcriptBuffer.trim();
    
    // Check if we should process this transcript
    if (!this.shouldProcessTranscript(transcript)) {
      return;
    }

    console.log(`[STT] Processing complete transcript: "${transcript}"`);
    
    // Mark as processing to prevent overlapping
    this.isProcessing = true;
    
    // Emit the transcript
    this.emit('speech_transcribed', transcript);
    
    // Clear buffer and timer
    this.transcriptBuffer = '';
    this.clearSilenceTimer();
    
    // Reset processing flag after a delay
    setTimeout(() => {
      this.isProcessing = false;
    }, 500);
  }

  shouldProcessTranscript(transcript) {
    // Don't process if already processing
    if (this.isProcessing) {
      console.log('[STT] Skipping - already processing');
      return false;
    }

    // Don't process empty or too short transcripts
    if (!transcript || transcript.length < this.MIN_TRANSCRIPT_LENGTH) {
      console.log('[STT] Skipping - transcript too short');
      return false;
    }

    // Don't process common filler words or incomplete thoughts
    const fillerWords = ['um', 'uh', 'ah', 'er', 'hmm', 'yeah', 'ok'];
    const words = transcript.toLowerCase().split(' ').filter(w => w.length > 0);
    
    if (words.length === 1 && fillerWords.includes(words[0])) {
      console.log('[STT] Skipping - filler word');
      return false;
    }

    return true;
  }

  clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  sendAudio(audioPayload) {
    if (this.connection && this.connection.getReadyState() === 1) {
      this.connection.send(Buffer.from(audioPayload, 'base64'));
    }
  }

  // Method to manually trigger processing (useful for testing)
  forceProcess() {
    if (this.transcriptBuffer.trim()) {
      this.processBufferedTranscript();
    }
  }

  close() {
    this.clearSilenceTimer();
    if (this.connection) {
      this.connection.finish();
    }
  }
}

module.exports = SttService;