'use client';

import { useCallback, useRef, useState, useEffect } from 'react';

// ============================================
// AUDIO PLAYER HOOK
// ============================================
// Plays PCM16 16kHz audio chunks received via WebSocket using Web Audio API

const SAMPLE_RATE = 16000; // PCM16 16kHz from ElevenLabs

export interface UseAudioPlayerReturn {
  play: () => void;
  stop: () => void;
  addChunk: (chunk: ArrayBuffer) => void;
  isPlaying: boolean;
  clear: () => void;
  onPlaybackEnd: (callback: () => void) => void;
}

/**
 * Convert PCM16 bytes to Float32 for Web Audio API
 * ElevenLabs sends little-endian PCM16 (signed 16-bit)
 */
function pcm16BytesToFloat32(uint8Array: Uint8Array): Float32Array {
  // Ensure even number of bytes (2 bytes per PCM16 sample)
  const byteLength = uint8Array.byteLength & ~1; // Round down to even
  
  if (byteLength === 0) {
    return new Float32Array(0);
  }
  
  // Create a properly aligned copy of the buffer
  const alignedBuffer = new ArrayBuffer(byteLength);
  const alignedView = new Uint8Array(alignedBuffer);
  alignedView.set(uint8Array.subarray(0, byteLength));
  
  const dataView = new DataView(alignedBuffer);
  const numSamples = byteLength / 2;
  const float32 = new Float32Array(numSamples);
  
  for (let i = 0; i < numSamples; i++) {
    // Read as little-endian signed 16-bit integer
    const sample = dataView.getInt16(i * 2, true); // true = little-endian
    // Normalize to -1.0 to 1.0
    float32[i] = sample / 32768;
  }
  
  return float32;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const playbackEndCallbackRef = useRef<(() => void) | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const scheduledEndTimeRef = useRef<number>(0);

  /**
   * Get or create AudioContext (lazy initialization)
   */
  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
        sampleRate: SAMPLE_RATE,
      });
    }
    
    // Resume if suspended (browser autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    
    return audioContextRef.current;
  }, []);

  /**
   * Play accumulated audio chunks as PCM16
   */
  const playAudio = useCallback(() => {
    if (chunksRef.current.length === 0) return;

    const audioContext = getAudioContext();

    // Combine all chunks into single buffer
    const totalLength = chunksRef.current.reduce((acc, chunk) => acc + chunk.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of chunksRef.current) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    // Convert PCM16 bytes to Float32 for Web Audio API
    const float32 = pcm16BytesToFloat32(combined);

    // Create audio buffer
    const audioBuffer = audioContext.createBuffer(1, float32.length, SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(float32);

    // Stop any currently playing audio
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch {
        // Ignore errors from already stopped sources
      }
    }

    // Create and configure source node
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    currentSourceRef.current = source;

    // Handle playback end
    source.onended = () => {
      console.log('[AudioPlayer] Playback ended');
      isPlayingRef.current = false;
      setIsPlaying(false);
      currentSourceRef.current = null;
      
      // Call the playback end callback
      if (playbackEndCallbackRef.current) {
        playbackEndCallbackRef.current();
      }
    };

    // Start playback
    source.start(0);
    isPlayingRef.current = true;
    setIsPlaying(true);
    
    // Calculate end time for scheduling
    scheduledEndTimeRef.current = audioContext.currentTime + audioBuffer.duration;
    
    console.log(`[AudioPlayer] Playing ${float32.length} samples (${(audioBuffer.duration * 1000).toFixed(0)}ms)`);
    
    // Clear chunks after starting playback
    chunksRef.current = [];
  }, [getAudioContext]);

  /**
   * Add audio chunk to buffer
   */
  const addChunk = useCallback((chunk: ArrayBuffer) => {
    chunksRef.current.push(chunk);

    // Mark as "playing" immediately when receiving chunks (buffering state)
    // This prevents auto-listening from starting while audio is being received
    if (!isPlayingRef.current) {
      isPlayingRef.current = true;
      setIsPlaying(true);
    }

    // Debounce playback start - wait for chunks to accumulate
    // Start playing after 150ms of no new chunks (stream likely complete)
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
    }

    playTimeoutRef.current = setTimeout(() => {
      if (chunksRef.current.length > 0) {
        console.log(`[AudioPlayer] Starting playback with ${chunksRef.current.length} chunks`);
        playAudio();
      }
    }, 150);
  }, [playAudio]);

  /**
   * Start playback manually
   */
  const play = useCallback(() => {
    if (!isPlayingRef.current && chunksRef.current.length > 0) {
      playAudio();
    }
  }, [playAudio]);

  /**
   * Stop playback and clear buffer
   */
  const stop = useCallback(() => {
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }

    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch {
        // Ignore errors from already stopped sources
      }
      currentSourceRef.current = null;
    }

    chunksRef.current = [];
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  /**
   * Clear buffer without stopping
   */
  const clear = useCallback(() => {
    chunksRef.current = [];
  }, []);

  /**
   * Set callback for when playback ends
   */
  const onPlaybackEnd = useCallback((callback: () => void) => {
    playbackEndCallbackRef.current = callback;
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
      }
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
          currentSourceRef.current.disconnect();
        } catch {
          // Ignore cleanup errors
        }
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    play,
    stop,
    addChunk,
    isPlaying,
    clear,
    onPlaybackEnd,
  };
}
