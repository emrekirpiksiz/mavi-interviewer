import { config } from '../config/index.js';
import { connectionManager } from '../websocket/connectionManager.js';
import { saveAIChunk } from './audioRecordingService.js';

// ============================================
// ELEVENLABS TTS SERVICE
// ============================================

// TTS API Configuration
const TTS_BASE_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
// Using flash v2.5 - fastest model for ultra-low latency
const TTS_MODEL = 'eleven_flash_v2_5';
const TTS_OUTPUT_FORMAT = 'pcm_16000'; // PCM16 16kHz - required for Simli lip-sync

// Track active TTS requests for interruption
const activeTTSRequests = new Map<string, AbortController>();

/**
 * Get full TTS audio buffer (not streaming) - for Simli lip-sync
 * Buffer the entire audio then send as single binary message
 * @param sessionId - Session ID for WebSocket targeting
 * @param text - Text to convert to speech
 * @returns Promise that resolves when audio is sent
 */
export async function getFullAudioAndSend(sessionId: string, text: string): Promise<void> {
  const apiKey = config.elevenLabsApiKey;
  const voiceId = config.elevenLabsVoiceId;

  if (!apiKey) {
    console.error('[TTS] ElevenLabs API key not configured');
    throw new Error('TTS_NOT_CONFIGURED');
  }

  if (!text || text.trim().length === 0) {
    console.error('[TTS] Empty text provided');
    throw new Error('TTS_EMPTY_TEXT');
  }

  // Cancel any existing TTS request for this session
  cancelTTS(sessionId);

  // Create abort controller for this request
  const abortController = new AbortController();
  activeTTSRequests.set(sessionId, abortController);

  // Use query parameter for output_format (as per ElevenLabs API and POC)
  const url = `${TTS_BASE_URL}/${voiceId}?output_format=${TTS_OUTPUT_FORMAT}`;

  console.log(`[TTS] Getting full audio for session ${sessionId} - "${text.substring(0, 50)}..."`);

  const startTime = Date.now();
  const inputSize = text.length;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        model_id: TTS_MODEL,
        apply_text_normalization: 'auto', // Normalize numbers, abbreviations for natural reading
        voice_settings: {
          stability: 0.5,         // Lower = more natural variation, breathing
          similarity_boost: 0.75, // Slightly lower for more natural feel
          style: 0.25,            // Higher = more expressive, natural pauses
          use_speaker_boost: true,
        },
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TTS] API error: ${response.status} - ${errorText}`);
      throw new Error(`TTS_API_ERROR: ${response.status}`);
    }

    // Get full audio buffer
    const arrayBuffer = await response.arrayBuffer();
    let audioData = new Uint8Array(arrayBuffer);
    
    const durationMs = Date.now() - startTime;
    console.log(`[TTS] Received audio: ${audioData.length} bytes (${durationMs}ms)`);
    
    // Check for WAV header and strip if present
    // WAV header starts with "RIFF" (0x52494646)
    const hasWavHeader = audioData[0] === 0x52 && audioData[1] === 0x49 && 
                         audioData[2] === 0x46 && audioData[3] === 0x46;
    
    if (hasWavHeader) {
      console.log('[TTS] WAV header detected, stripping 44 bytes');
      audioData = audioData.slice(44);
    }
    
    const audioDurationMs = (audioData.length / 32000) * 1000;
    console.log(`[TTS] Final PCM16 audio: ${audioData.length} bytes (${audioDurationMs.toFixed(0)}ms audio)`);
    
    // Send network metric with request/response details
    connectionManager.sendNetworkMetric(sessionId, 'elevenlabs', 'text_to_speech', durationMs, {
      inputSize,
      outputSize: audioData.length,
      metadata: {
        model: TTS_MODEL,
        voiceId,
        audioDurationMs: Math.round(audioDurationMs),
        textLength: text.length,
      },
      requestDetails: {
        url: url,
        method: 'POST',
        body: {
          text: text,
          model_id: TTS_MODEL,
        },
      },
      responseDetails: {
        status: response.status,
        content: `[Audio PCM16 data: ${audioData.length} bytes, ~${Math.round(audioDurationMs)}ms duration]`,
      },
    });
    
    // Send full audio buffer to frontend via WebSocket
    connectionManager.sendBinary(sessionId, audioData);
    
    // Save AI audio chunk for recording (fire-and-forget)
    saveAIChunk(sessionId, audioData).catch(err => {
      console.error(`[TTS] Failed to save AI chunk for recording:`, err);
    });
    
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`[TTS] Request aborted for session ${sessionId}`);
      return;
    }
    throw error;
  } finally {
    activeTTSRequests.delete(sessionId);
  }
}

/**
 * @deprecated Use getFullAudioAndSend instead for Simli lip-sync
 * Stream TTS audio chunks to frontend via WebSocket
 * @param sessionId - Session ID for WebSocket targeting
 * @param text - Text to convert to speech
 * @returns Promise that resolves when streaming is complete
 */
export async function streamTTS(sessionId: string, text: string): Promise<void> {
  // Redirect to new function for proper Simli integration
  return getFullAudioAndSend(sessionId, text);
}

/**
 * Cancel any active TTS stream for a session
 * @param sessionId - Session ID to cancel TTS for
 */
export function cancelTTS(sessionId: string): void {
  const controller = activeTTSRequests.get(sessionId);
  if (controller) {
    console.log(`[TTS] Cancelling stream for session ${sessionId}`);
    controller.abort();
    activeTTSRequests.delete(sessionId);
  }
}

/**
 * Check if TTS is currently streaming for a session
 * @param sessionId - Session ID to check
 * @returns True if TTS is active
 */
export function isTTSActive(sessionId: string): boolean {
  return activeTTSRequests.has(sessionId);
}

/**
 * Simple test function to verify TTS configuration
 * @returns Promise with configuration status
 */
export async function testTTSConfig(): Promise<{ configured: boolean; voiceId: string }> {
  return {
    configured: Boolean(config.elevenLabsApiKey),
    voiceId: config.elevenLabsVoiceId,
  };
}
