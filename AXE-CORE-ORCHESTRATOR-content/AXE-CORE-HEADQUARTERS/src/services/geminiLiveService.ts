/**
 * geminiLiveService.ts
 * ------------------------------------------------------------------
 * Gemini Live API integration for AXE CORE.
 * 
 * This provides REAL-TIME bidirectional audio streaming:
 * - Microphone → Gemini Live API (speech input)
 * - Gemini Live API → Speakers (speech output)
 * - Interrupt support (you can talk while AXE is speaking)
 * - Continuous conversation (no "send message" button needed)
 * 
 * Based on Luka's Python implementation using google-genai SDK.
 * Adapted for browser use with Web Audio API and WebSocket.
 * ------------------------------------------------------------------ */

import { GoogleGenAI } from '@google/genai';
import { AXE_SYSTEM_PROMPT } from '@/store/voiceStore';

// Use any for SDK internal types that aren't exported
 type LiveSession = any;

// Audio constants (match Luka's Python settings)
const SEND_SAMPLE_RATE = 16000;  // Input: 16kHz
const RECEIVE_SAMPLE_RATE = 24000; // Output: 24kHz
const CHUNK_SIZE = 1024;

// Live API config matching Luka's setup
const LIVE_MODEL = 'gemini-3.1-flash-live-preview';

interface GeminiLiveConfig {
  voiceName: 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Aoede';
  mediaResolution: 'low' | 'medium' | 'high';
  enableGoogleSearch: boolean;
  systemInstruction?: string;
}

interface GeminiLiveCallbacks {
  onStart?: () => void;
  onStop?: () => void;
  onAudio?: (audioData: ArrayBuffer) => void;
  onText?: (text: string) => void;
  onError?: (error: string) => void;
  onListening?: () => void;
  onSpeaking?: () => void;
  onIdle?: () => void;
}

export class GeminiLiveService {
  private client: GoogleGenAI | null = null;
  private session: LiveSession | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private isRunning = false;
  private isSpeaking = false;
  private audioQueue: ArrayBuffer[] = [];
  private callbacks: GeminiLiveCallbacks = {};
  private apiKey: string = '';

  constructor() {}

  /**
   * Initialize with API key
   */
  setApiKey(key: string) {
    this.apiKey = key;
    this.client = new GoogleGenAI({ apiKey: key });
  }

  /**
   * Check if Live API is available (has API key)
   */
  isAvailable(): boolean {
    return !!this.apiKey && !!this.client;
  }

  /**
   * Start Gemini Live session with bidirectional audio
   */
  async start(config: Partial<GeminiLiveConfig> = {}): Promise<void> {
    if (this.isRunning) {
      console.warn('[GeminiLive] Already running');
      return;
    }

    if (!this.client) {
      this.callbacks.onError?.('No API key configured. Set GEMINI_API_KEY or GEMINI_LIVE_API_KEY.');
      return;
    }

    try {
      // Merge with defaults
      const fullConfig: GeminiLiveConfig = {
        voiceName: config.voiceName ?? 'Zephyr',
        mediaResolution: config.mediaResolution ?? 'medium',
        enableGoogleSearch: config.enableGoogleSearch ?? true,
        systemInstruction: config.systemInstruction ?? AXE_SYSTEM_PROMPT,
      };

      // Connect to Live API
      this.session = await (this.client as any).live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: ['AUDIO' as any],
          mediaResolution: this.mapResolution(fullConfig.mediaResolution) as any,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: fullConfig.voiceName,
              },
            },
          },
          systemInstruction: {
            parts: [{ text: fullConfig.systemInstruction }],
          },
          ...(fullConfig.enableGoogleSearch ? {
            tools: [{ googleSearch: {} }]
          } : {}),
        },
      });

      this.isRunning = true;
      this.callbacks.onStart?.();
      this.callbacks.onIdle?.();

      // Start audio streaming
      await this.startAudioStreaming();

      // Start receiving responses
      this.startReceiving();

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[GeminiLive] Failed to start:', err);
      this.callbacks.onError?.(`Live API Error: ${msg}`);
      this.cleanup();
    }
  }

  /**
   * Stop the Live session
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.cleanup();
    this.callbacks.onStop?.();
  }

  /**
   * Set callbacks for events
   */
  setCallbacks(callbacks: GeminiLiveCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Send text input (for when user types instead of speaks)
   */
  async sendText(text: string): Promise<void> {
    if (!this.session || !this.isRunning) {
      this.callbacks.onError?.('Live session not active');
      return;
    }

    try {
      await this.session.sendText(text);
    } catch (err) {
      console.error('[GeminiLive] Send text error:', err);
    }
  }

  /**
   * Interrupt AXE (stop current speech output)
   */
  async interrupt(): Promise<void> {
    if (!this.session) return;
    
    // Clear audio queue to stop playback
    this.audioQueue = [];
    this.isSpeaking = false;
    this.callbacks.onIdle?.();
    
    // The Live API handles interruptions automatically when new input is sent
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private async startAudioStreaming(): Promise<void> {
    try {
      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SEND_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: SEND_SAMPLE_RATE });
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Create script processor for raw audio capture
      this.processorNode = this.audioContext.createScriptProcessor(CHUNK_SIZE, 1, 1);
      
      this.processorNode.onaudioprocess = (e) => {
        if (!this.isRunning || !this.session) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Convert Float32 to Int16 (PCM16)
        const pcmData = this.float32ToInt16(inputData);
        
        // Send to Gemini Live API
        try {
          this.session.sendAudio(pcmData);
        } catch (err) {
          // Ignore errors during streaming
        }
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.callbacks.onListening?.();

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[GeminiLive] Audio streaming error:', err);
      this.callbacks.onError?.(`Microphone error: ${msg}`);
    }
  }

  private async startReceiving(): Promise<void> {
    if (!this.session) return;

    try {
      // Create audio context for output (24kHz)
      const outputContext = new AudioContext({ sampleRate: RECEIVE_SAMPLE_RATE });
      
      // Process incoming audio
      for await (const response of this.session.receive()) {
        if (!this.isRunning) break;

        // Handle audio data
        if (response.audio) {
          this.isSpeaking = true;
          this.callbacks.onSpeaking?.();
          
          // Convert to ArrayBuffer for Web Audio API
          const audioData = await this.base64ToArrayBuffer(response.audio);
          this.audioQueue.push(audioData);
          
          // Play audio
          this.playAudioQueue(outputContext);
          
          this.callbacks.onAudio?.(audioData);
        }

        // Handle text (transcription or other text output)
        if (response.text) {
          this.callbacks.onText?.(response.text);
        }

        // Handle turn completion (when AXE finishes speaking)
        if (response.turnComplete) {
          this.isSpeaking = false;
          this.callbacks.onIdle?.();
        }
      }
    } catch (err) {
      if (this.isRunning) {
        console.error('[GeminiLive] Receive error:', err);
        this.callbacks.onError?.('Connection lost');
      }
    }
  }

  private async playAudioQueue(context: AudioContext): Promise<void> {
    if (this.audioQueue.length === 0) return;

    const audioData = this.audioQueue.shift()!;
    
    try {
      // Decode PCM16 audio
      const audioBuffer = await context.decodeAudioData(audioData);
      
      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);
      source.start();
      
      // Continue playing queue
      source.onended = () => {
        if (this.audioQueue.length > 0) {
          this.playAudioQueue(context);
        } else if (!this.isSpeaking) {
          this.callbacks.onIdle?.();
        }
      };
    } catch (err) {
      console.error('[GeminiLive] Audio playback error:', err);
    }
  }

  private float32ToInt16(float32Array: Float32Array): ArrayBuffer {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array.buffer;
  }

  private async base64ToArrayBuffer(base64: string): Promise<ArrayBuffer> {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private mapResolution(res: 'low' | 'medium' | 'high'): string {
    switch (res) {
      case 'low': return 'MEDIA_RESOLUTION_LOW';
      case 'medium': return 'MEDIA_RESOLUTION_MEDIUM';
      case 'high': return 'MEDIA_RESOLUTION_HIGH';
      default: return 'MEDIA_RESOLUTION_MEDIUM';
    }
  }

  private cleanup(): void {
    // Stop audio processing
    if (this.processorNode) {
      try { this.processorNode.disconnect(); } catch {}
      this.processorNode = null;
    }
    
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch {}
      this.sourceNode = null;
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    
    if (this.audioContext) {
      try { this.audioContext.close(); } catch {}
      this.audioContext = null;
    }
    
    // Close session
    if (this.session) {
      try { this.session.close(); } catch {}
      this.session = null;
    }
    
    this.audioQueue = [];
    this.isSpeaking = false;
  }
}

// Singleton instance
let _liveService: GeminiLiveService | null = null;

export function getGeminiLiveService(): GeminiLiveService {
  if (!_liveService) {
    _liveService = new GeminiLiveService();
  }
  return _liveService;
}

export function setGeminiLiveApiKey(key: string): void {
  const service = getGeminiLiveService();
  service.setApiKey(key);
}

export function isGeminiLiveAvailable(): boolean {
  return getGeminiLiveService().isAvailable();
}

export async function startGeminiLive(config?: Partial<GeminiLiveConfig>): Promise<void> {
  return getGeminiLiveService().start(config);
}

export async function stopGeminiLive(): Promise<void> {
  return getGeminiLiveService().stop();
}
