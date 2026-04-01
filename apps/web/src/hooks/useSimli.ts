'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { SimliClient, generateSimliSessionToken, LogLevel } from 'simli-client';
import { useInterviewStore } from '../stores/interviewStore';
import type { NetworkMetric } from '@ai-interview/shared';

// ============================================
// SIMLI AVATAR HOOK
// ============================================
// Manages Simli AI avatar with lip-sync for TTS audio
// Compatible with simli-client SDK v3.0.x — uses LiveKit transport (recommended by Simli)

export interface UseSimliOptions {
  apiKey: string;
  faceId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export interface UseSimliReturn {
  initialize: () => Promise<boolean>;
  sendAudioToSimli: (audioData: Uint8Array) => Promise<number>;
  clearBuffer: () => void;
  close: () => void;
  isReady: boolean;
  isConnecting: boolean;
  isSpeaking: boolean;
  error: string | null;
}

export function useSimli(options: UseSimliOptions): UseSimliReturn {
  const { apiKey, faceId, videoRef, audioRef } = options;

  const simliClientRef = useRef<SimliClient | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSimliReady = useInterviewStore((state) => state.setSimliReady);
  const addNetworkMetric = useInterviewStore((state) => state.addNetworkMetric);

  const CHUNK_SIZE = 6000;
  const SEND_INTERVAL = 20;

  /**
   * Initialize Simli client v3: generate session token, then connect WebRTC
   */
  const initialize = useCallback(async (): Promise<boolean> => {
    if (!apiKey || !faceId) {
      console.warn('[Simli] Missing API key or face ID, skipping initialization');
      setError('Simli yapılandırması eksik');
      return false;
    }

    if (isConnecting || isReady) {
      console.log('[Simli] Already connecting or connected');
      return isReady;
    }

    if (!videoRef.current || !audioRef.current) {
      console.error('[Simli] Video or audio ref not available');
      setError('Video/Audio elementi bulunamadı');
      return false;
    }

    setIsConnecting(true);
    setError(null);

    try {
      console.log('[Simli] Initializing with SDK v3...');
      console.log('[Simli] API Key:', apiKey.substring(0, 8) + '...');
      console.log('[Simli] Face ID:', faceId);

      // Step 1: Generate session token via REST API
      console.log('[Simli] Generating session token...');
      const tokenStartTime = Date.now();
      const tokenResponse = await generateSimliSessionToken({
        apiKey,
        config: {
          faceId,
          handleSilence: true,
          maxSessionLength: 1800,
          maxIdleTime: 300,
        },
      });
      console.log(`[Simli] Session token received (${Date.now() - tokenStartTime}ms)`);

      // Step 2: Create SimliClient with LiveKit transport (recommended by Simli docs)
      const simliClient = new SimliClient(
        tokenResponse.session_token,
        videoRef.current as HTMLVideoElement,
        audioRef.current as HTMLAudioElement,
        null,
        LogLevel.INFO,
        'livekit',
      );
      simliClientRef.current = simliClient;

      // Step 3: Set up event listeners
      simliClient.on('start', () => {
        console.log('[Simli] Connected - LiveKit WebRTC established');
        setIsReady(true);
        setIsConnecting(false);
        setSimliReady(true);
      });
      simliClient.on('stop', () => {
        console.log('[Simli] Disconnected');
        setIsReady(false);
        setSimliReady(false);
      });
      simliClient.on('error', (reason: string) => {
        console.error('[Simli] Connection error:', reason);
        setError(`Avatar bağlantı hatası: ${reason}`);
        setIsReady(false);
        setIsConnecting(false);
        setSimliReady(false);
      });
      simliClient.on('speaking', () => setIsSpeaking(true));
      simliClient.on('silent', () => setIsSpeaking(false));

      // Step 4: Start the WebRTC connection
      console.log('[Simli] Starting LiveKit connection...');
      await simliClient.start();
      console.log('[Simli] LiveKit WebRTC connected');
      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Simli] Initialization error:', errMsg);
      setError('Avatar başlatılamadı');
      setIsConnecting(false);
      setSimliReady(false);
      return false;
    }
  }, [apiKey, faceId, videoRef, audioRef, isConnecting, isReady, setSimliReady]);

  /**
   * Send audio data to Simli for lip-sync in chunks
   */
  const sendAudioToSimli = useCallback(async (audioData: Uint8Array): Promise<number> => {
    const client = simliClientRef.current;
    
    if (!client) {
      console.warn('[Simli] Cannot send audio - no client');
      return 0;
    }

    if (!isReady) {
      console.warn('[Simli] Cannot send audio - not ready');
      return 0;
    }

    const startTime = Date.now();
    const totalChunks = Math.ceil(audioData.length / CHUNK_SIZE);
    console.log(`[Simli] Sending ${totalChunks} chunks (${audioData.length} bytes total)`);

    try {
      for (let i = 0; i < audioData.length; i += CHUNK_SIZE) {
        const chunk = audioData.slice(i, Math.min(i + CHUNK_SIZE, audioData.length));
        client.sendAudioData(chunk);
        
        if (i + CHUNK_SIZE < audioData.length) {
          await new Promise(resolve => setTimeout(resolve, SEND_INTERVAL));
        }
      }
      
      const sendDurationMs = Date.now() - startTime;
      console.log(`[Simli] All chunks sent in ${sendDurationMs}ms`);
      
      const audioDurationMs = (audioData.length / 32000) * 1000;
      
      const metric: NetworkMetric = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        service: 'simli',
        operation: 'send_audio_lipsync',
        durationMs: sendDurationMs,
        inputSize: audioData.length,
        outputSize: 0,
        timestamp: Date.now(),
        metadata: {
          chunks: totalChunks,
          audioDurationMs: Math.round(audioDurationMs),
          faceId: faceId,
        },
      };
      addNetworkMetric(metric);
      
      return audioDurationMs;
      
    } catch (err) {
      console.error('[Simli] Error sending audio:', err);
      return 0;
    }
  }, [isReady, CHUNK_SIZE, SEND_INTERVAL, faceId, addNetworkMetric]);

  /**
   * Clear audio buffer
   */
  const clearBuffer = useCallback(() => {
    if (!simliClientRef.current || !isReady) return;

    try {
      simliClientRef.current.ClearBuffer();
      console.log('[Simli] Buffer cleared');
    } catch (err) {
      console.error('[Simli] Error clearing buffer:', err);
    }
  }, [isReady]);

  /**
   * Close Simli connection
   */
  const close = useCallback(() => {
    if (simliClientRef.current) {
      try {
        simliClientRef.current.stop();
        console.log('[Simli] Connection closed');
      } catch (err) {
        console.error('[Simli] Error closing connection:', err);
      }
      simliClientRef.current = null;
    }
    setIsReady(false);
    setIsConnecting(false);
    setSimliReady(false);
  }, [setSimliReady]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (simliClientRef.current) {
        try {
          simliClientRef.current.stop();
        } catch {
          // Ignore cleanup errors
        }
        simliClientRef.current = null;
      }
    };
  }, []);

  return {
    initialize,
    sendAudioToSimli,
    clearBuffer,
    close,
    isReady,
    isConnecting,
    isSpeaking,
    error,
  };
}

// ============================================
// SIMLI CONFIG HELPER
// ============================================

export const SIMLI_CONFIG = {
  defaultFaceId: process.env.NEXT_PUBLIC_SIMLI_FACE_ID || 'cace3ef7-a4c4-425d-a8cf-a5358eb0c427',
} as const;
