/**
 * geminiLiveService.ts
 * ------------------------------------------------------------------
 * Gemini Live API integration for AXE CORE.
 * 
 * Direct WebSocket connection (browser-compatible).
 * No Python SDK needed — pure WebSocket for real-time bidirectional audio.
 * ------------------------------------------------------------------ */

import { AXE_SYSTEM_PROMPT } from '@/store/voiceStore';

const LIVE_MODEL = 'gemini-2.0-flash-live-001';
const LIVE_API_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

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
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private isRunning = false;
  private isSpeaking = false;
  private audioQueue: ArrayBuffer[] = [];
  private callbacks: GeminiLiveCallbacks = {};
  private apiKey: string = '';
  private sessionId: string = '';
  private textBuffer: string = ''; // accumulates text chunks within a model turn

  setApiKey(key: string) { this.apiKey = key; }
  isAvailable(): boolean { return !!this.apiKey; }
  isActive(): boolean { return this.isRunning && !!this.ws; }
  setCallbacks(cbs: GeminiLiveCallbacks) { this.callbacks = { ...this.callbacks, ...cbs }; }

  /**
   * Start Gemini Live WebSocket session
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    if (!this.apiKey) { this.callbacks.onError?.('No API key'); return; }

    try {
      // Build WebSocket URL with API key
      const url = `${LIVE_API_URL}?key=${this.apiKey}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[GeminiLive] WebSocket connected');
        this.sendSetup();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.error('[GeminiLive] WebSocket error:', err);
        this.callbacks.onError?.('WebSocket connection error');
      };

      this.ws.onclose = () => {
        console.log('[GeminiLive] WebSocket closed');
        this.cleanup();
        this.callbacks.onStop?.();
      };

      this.isRunning = true;
      this.callbacks.onStart?.();

      // Start audio capture
      await this.startAudioCapture();

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onError?.(`Live start error: ${msg}`);
      this.cleanup();
    }
  }

  /**
   * Stop everything
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.cleanup();
  }

  /**
   * Send text via WebSocket
   */
  async sendText(text: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    const message = {
      client_content: {
        turns: [{
          role: 'user',
          parts: [{ text }]
        }],
        turn_complete: true
      }
    };
    
    this.ws.send(JSON.stringify(message));
  }

  // ── Private: WebSocket Setup ───────────────────────────────────────────

  private sendSetup(): void {
    if (!this.ws) return;
    
    const setup = {
      setup: {
        model: `models/${LIVE_MODEL}`,
        generation_config: {
          response_modalities: ['AUDIO', 'TEXT'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: 'Zephyr'
              }
            }
          }
        },
        system_instruction: {
          parts: [{ text: AXE_SYSTEM_PROMPT }]
        }
      }
    };
    
    this.ws.send(JSON.stringify(setup));
  }

  private handleMessage(data: string | Blob): void {
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        
        // Handle setup complete
        if (parsed.setup_complete) {
          console.log('[GeminiLive] Setup complete');
          this.callbacks.onIdle?.();
          return;
        }
        
        // Handle server content (audio + text)
        if (parsed.server_content) {
          const content = parsed.server_content;
          
          // Handle model turn (audio + text chunks)
          if (content.model_turn) {
            for (const part of content.model_turn.parts) {
              if (part.inline_data) {
                this.handleAudioData(part.inline_data.data);
              }
              if (part.text) {
                // Accumulate text chunks — Gemini Live sends partial fragments
                this.textBuffer += part.text;
              }
            }
          }
          
          // Turn complete — flush accumulated text as one message
          if (content.turn_complete) {
            this.isSpeaking = false;
            if (this.textBuffer.trim()) {
              this.callbacks.onText?.(this.textBuffer.trim());
              this.textBuffer = '';
            }
            this.callbacks.onIdle?.();
          }
        }
        
      } catch (err) {
        console.error('[GeminiLive] Parse error:', err);
      }
    } else if (data instanceof Blob) {
      // Binary audio data
      this.handleAudioBlob(data);
    }
  }

  private handleAudioData(base64Data: string): void {
    this.isSpeaking = true;
    this.callbacks.onSpeaking?.();
    
    // Convert base64 to ArrayBuffer
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    this.audioQueue.push(bytes.buffer);
    this.playAudioQueue();
    this.callbacks.onAudio?.(bytes.buffer);
  }

  private async handleAudioBlob(blob: Blob): Promise<void> {
    const arrayBuffer = await blob.arrayBuffer();
    this.handleAudioData(btoa(String.fromCharCode(...new Uint8Array(arrayBuffer))));
  }

  // ── Private: Audio Capture ─────────────────────────────────────────────

  private async startAudioCapture(): Promise<void> {
    try {
      // Get microphone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Create audio context at 16kHz (Gemini expects 16kHz)
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Script processor for raw PCM capture
      this.processorNode = this.audioContext.createScriptProcessor(1024, 1, 1);
      
      this.processorNode.onaudioprocess = (e) => {
        if (!this.isRunning || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = this.float32ToInt16(inputData);
        
        // Send audio to Gemini Live
        const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcmData)));
        
        const message = {
          realtime_input: {
            media_chunks: [{
              data: base64Audio,
              mime_type: 'audio/pcm'
            }]
          }
        };
        
        this.ws.send(JSON.stringify(message));
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);
      
      this.callbacks.onListening?.();
      
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onError?.(`Audio capture error: ${msg}`);
    }
  }

  // ── Private: Audio Playback ──────────────────────────────────────────

  private async playAudioQueue(): Promise<void> {
    if (this.audioQueue.length === 0) return;
    
    const audioData = this.audioQueue.shift()!;
    
    try {
      // Create temp audio context for playback at 24kHz (Gemini output rate)
      const ctx = new AudioContext({ sampleRate: 24000 });
      
      // Convert Int16 PCM to Float32
      const floatData = this.int16ToFloat32(audioData);
      
      // Create buffer
      const buffer = ctx.createBuffer(1, floatData.length, 24000);
      buffer.copyToChannel(floatData as any, 0);
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
      
      source.onended = () => {
        ctx.close();
        if (this.audioQueue.length > 0) {
          this.playAudioQueue();
        } else if (!this.isSpeaking) {
          this.callbacks.onIdle?.();
        }
      };
      
    } catch (err) {
      console.error('[GeminiLive] Playback error:', err);
      if (this.audioQueue.length > 0) {
        this.playAudioQueue();
      }
    }
  }

  // ── Private: Audio Converters ────────────────────────────────────────

  private float32ToInt16(float32Array: Float32Array): ArrayBuffer {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array.buffer;
  }

  private int16ToFloat32(arrayBuffer: ArrayBuffer): Float32Array {
    const int16Array = new Int16Array(arrayBuffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 0x7FFF;
    }
    return float32Array as any;
  }

  // ── Private: Cleanup ─────────────────────────────────────────────────

  private cleanup(): void {
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
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.audioQueue = [];
    this.isSpeaking = false;
    this.isRunning = false;
    this.textBuffer = '';
  }
}

// Singleton
let _liveService: GeminiLiveService | null = null;

export function getGeminiLiveService(): GeminiLiveService {
  if (!_liveService) _liveService = new GeminiLiveService();
  return _liveService;
}

export function setGeminiLiveApiKey(key: string): void {
  getGeminiLiveService().setApiKey(key);
}

export function isGeminiLiveAvailable(): boolean {
  return getGeminiLiveService().isAvailable();
}

export async function startGeminiLive(): Promise<void> {
  return getGeminiLiveService().start();
}

export async function stopGeminiLive(): Promise<void> {
  return getGeminiLiveService().stop();
}
