'use client';

import { useCallback, useRef, useState } from 'react';

// ============================================
// VIDEO RECORDING HOOK — CHUNKED UPLOAD
// ============================================
// Records the candidate's camera (video) + microphone (audio) + AI audio
// using MediaRecorder.  Mic and AI audio are mixed together via a
// shared AudioContext → MediaStreamDestination so both sides of the
// conversation appear in the final recording.
//
// Each 5-second chunk is uploaded to the backend immediately via
// POST /sessions/:id/video/chunk, and when recording stops
// POST /sessions/:id/video/commit finalises the Azure Block Blob.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:2223';

export interface UseVideoRecordingReturn {
  isRecording: boolean;
  uploadedChunks: number;
  failedChunks: number;
  startRecording: (cameraStream: MediaStream, sessionId: string) => void;
  stopRecording: () => Promise<boolean>;
  /** Feed AI audio (PCM16 mono 16 kHz) into the recording so the AI voice
   *  is captured alongside the candidate's microphone. */
  feedAiAudio: (pcm16: Uint8Array) => void;
}

const TIMESLICE_MS = 5000;
const MAX_CHUNK_RETRIES = 3;
const AI_AUDIO_SAMPLE_RATE = 16000;

function getPreferredMimeType(): string {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

async function uploadChunkWithRetry(
  sessionId: string,
  seq: number,
  blob: Blob,
  retries = MAX_CHUNK_RETRIES
): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const formData = new FormData();
      formData.append('chunk', blob, `chunk_${seq}.webm`);

      const response = await fetch(
        `${API_URL}/sessions/${sessionId}/video/chunk?seq=${seq}`,
        { method: 'POST', body: formData }
      );

      if (response.ok) return true;
      console.warn(`[VideoRecording] Chunk ${seq} upload attempt ${attempt + 1} failed: HTTP ${response.status}`);
    } catch (error) {
      console.warn(`[VideoRecording] Chunk ${seq} upload attempt ${attempt + 1} error:`, error);
    }

    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return false;
}

export function useVideoRecording(): UseVideoRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [uploadedChunks, setUploadedChunks] = useState(0);
  const [failedChunks, setFailedChunks] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const inflightRef = useRef<Promise<void>[]>([]);

  // Audio mixing refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const startRecording = useCallback(async (cameraStream: MediaStream, sessionId: string) => {
    if (recorderRef.current) return;

    sessionIdRef.current = sessionId;
    seqRef.current = 0;
    inflightRef.current = [];
    setUploadedChunks(0);
    setFailedChunks(0);

    // Create AudioContext for mixing mic + AI audio
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx({ sampleRate: 48000 });
    audioCtxRef.current = audioCtx;

    const destination = audioCtx.createMediaStreamDestination();
    destinationRef.current = destination;

    // Build the final stream: camera video + mixed audio destination
    const combinedStream = new MediaStream();

    for (const track of cameraStream.getVideoTracks()) {
      combinedStream.addTrack(track);
    }

    // Acquire mic and route through AudioContext → destination
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStreamRef.current = micStream;

      const micSource = audioCtx.createMediaStreamSource(micStream);
      micSourceRef.current = micSource;

      // Boost mic slightly so candidate voice is clear alongside AI
      const micGain = audioCtx.createGain();
      micGain.gain.value = 1.2;
      micSource.connect(micGain).connect(destination);
    } catch (err) {
      console.warn('[VideoRecording] Could not acquire mic for video recording, continuing without audio:', err);
    }

    // Use the mixed destination stream's audio track
    for (const track of destination.stream.getAudioTracks()) {
      combinedStream.addTrack(track);
    }

    const mimeType = getPreferredMimeType();
    const recorder = new MediaRecorder(combinedStream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 1_000_000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size === 0 || !sessionIdRef.current) return;

      const seq = seqRef.current++;
      const sid = sessionIdRef.current;
      const blob = e.data;

      const uploadPromise = uploadChunkWithRetry(sid, seq, blob).then((ok) => {
        if (ok) {
          setUploadedChunks((c) => c + 1);
        } else {
          setFailedChunks((c) => c + 1);
          console.error(`[VideoRecording] Chunk ${seq} permanently failed for session ${sid}`);
        }
      });

      inflightRef.current.push(uploadPromise);
    };

    recorder.start(TIMESLICE_MS);
    recorderRef.current = recorder;
    setIsRecording(true);
    console.log('[VideoRecording] Started with mixed audio (mic + AI)');
  }, []);

  /**
   * Feed AI audio into the recording mix.
   * Input: PCM16 mono at 16 kHz (same format sent to Simli / fallback player).
   * Converted to float32, resampled to AudioContext rate, played through
   * the shared destination node so MediaRecorder captures it.
   */
  const feedAiAudio = useCallback((pcm16: Uint8Array) => {
    const audioCtx = audioCtxRef.current;
    const destination = destinationRef.current;
    if (!audioCtx || !destination || audioCtx.state === 'closed') return;

    const int16 = new Int16Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength / 2);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i]! / 32768;
    }

    // Create a buffer at the original sample rate, then the browser will
    // resample to audioCtx.sampleRate automatically when played.
    const buffer = audioCtx.createBuffer(1, float32.length, AI_AUDIO_SAMPLE_RATE);
    buffer.getChannelData(0).set(float32);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    // Slightly reduce AI volume so it doesn't overpower the mic
    const aiGain = audioCtx.createGain();
    aiGain.gain.value = 0.8;
    source.connect(aiGain).connect(destination);
    source.start();
  }, []);

  const stopRecording = useCallback(async (): Promise<boolean> => {
    // Stop mic
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    // Disconnect audio graph
    if (micSourceRef.current) {
      try { micSourceRef.current.disconnect(); } catch { /* already disconnected */ }
      micSourceRef.current = null;
    }

    // Close AudioContext
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      try { audioCtxRef.current.close(); } catch { /* ignore */ }
      audioCtxRef.current = null;
    }
    destinationRef.current = null;

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    recorderRef.current = null;
    setIsRecording(false);

    // Wait for all in-flight chunk uploads to settle
    await Promise.allSettled(inflightRef.current);
    inflightRef.current = [];

    const sessionId = sessionIdRef.current;
    if (!sessionId) return false;

    try {
      const response = await fetch(
        `${API_URL}/sessions/${sessionId}/video/commit`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.ok) {
        console.error('[VideoRecording] Commit failed:', response.status);
        return false;
      }

      console.log(`[VideoRecording] Committed video for session ${sessionId}`);
      return true;
    } catch (error) {
      console.error('[VideoRecording] Commit error:', error);
      return false;
    }
  }, []);

  return {
    isRecording,
    uploadedChunks,
    failedChunks,
    startRecording,
    stopRecording,
    feedAiAudio,
  };
}
