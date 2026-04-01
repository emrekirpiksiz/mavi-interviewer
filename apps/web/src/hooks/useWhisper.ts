'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { useInterviewStore } from '../stores/interviewStore';
import { useSpeechRecognition } from './useSpeechRecognition';
import type { NetworkMetric } from '@ai-interview/shared';

// ============================================
// WHISPER STT HOOK
// ============================================
// Speech-to-text using OpenAI Whisper API via backend
// Includes Web Speech API for real-time interim transcripts

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const MIN_RECORDING_SECONDS = 2; // Minimum 2 seconds

export interface UseWhisperOptions {
  language?: 'tr' | 'en';
  contextPrompt?: string; // Additional context for better transcription accuracy
  onTranscript?: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onError?: (error: string) => void;
}

export interface UseWhisperReturn {
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<string | null>;
  isRecording: boolean;
  isProcessing: boolean;
  recordingSeconds: number;
  interimTranscript: string;
  error: string | null;
}

export function useWhisper(options: UseWhisperOptions = {}): UseWhisperReturn {
  const { language = 'tr', contextPrompt = '', onTranscript, onInterimTranscript, onError } = options;

  const addNetworkMetric = useInterviewStore((state) => state.addNetworkMetric);
  const interviewState = useInterviewStore((state) => state.interviewState);

  // Web Speech API for real-time interim transcripts
  // CRITICAL: Filter out transcripts when AI is speaking to prevent echo
  const speechLanguage = language === 'tr' ? 'tr-TR' : 'en-US';
  const {
    start: startSpeechRecognition,
    stop: stopSpeechRecognition,
    isSupported: speechRecognitionSupported,
    interimTranscript,
  } = useSpeechRecognition({
    language: speechLanguage,
    continuous: true,
    interimResults: true,
    onInterimTranscript: (text) => {
      // CRITICAL: Don't pass through interim transcripts when AI is speaking
      // This prevents AI audio from being transcribed as candidate speech
      const currentState = useInterviewStore.getState().interviewState;
      if (currentState === 'ai_speaking' || currentState === 'ai_generating') {
        console.log('[Whisper] Ignoring interim transcript - AI is speaking');
        return;
      }
      onInterimTranscript?.(text);
    },
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const onInterimRef = useRef(onInterimTranscript);
  onInterimRef.current = onInterimTranscript;
  const aiStopAppliedRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Update recording time every second
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingSeconds(elapsed);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordingSeconds(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  // CRITICAL: Stop all recording and clear transcript when AI is speaking
  // This prevents picking up AI audio from speakers and showing it as candidate speech
  useEffect(() => {
    const isAiBusy = interviewState === 'ai_speaking' || interviewState === 'ai_generating';

    if (isAiBusy && !aiStopAppliedRef.current) {
      aiStopAppliedRef.current = true;

      if (speechRecognitionSupported) {
        stopSpeechRecognition();
        console.log('[Whisper] Web Speech API stopped - AI is speaking');
      }
      
      onInterimRef.current?.('');
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        console.log('[Whisper] Stopping active recording - AI is speaking');
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        chunksRef.current = [];
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      }
    } else if (!isAiBusy) {
      aiStopAppliedRef.current = false;
    }
  }, [interviewState, speechRecognitionSupported, stopSpeechRecognition]);

  /**
   * Start recording audio
   * Will not start if AI is speaking or generating
   */
  const startRecording = useCallback(async (): Promise<boolean> => {
    // Don't allow recording when AI is speaking or generating
    const currentState = useInterviewStore.getState().interviewState;
    if (currentState === 'ai_speaking' || currentState === 'ai_generating') {
      console.log('[Whisper] Cannot start recording - AI is speaking/generating');
      return false;
    }

    try {
      setError(null);
      chunksRef.current = [];

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log('[Whisper] Chunk received:', event.data.size, 'bytes');
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('[Whisper] MediaRecorder error:', event);
        setError('Kayıt hatası');
        onError?.('Kayıt hatası');
      };

      // Start recording with timeslice to get continuous data
      mediaRecorder.start(500); // Get data every 500ms
      startTimeRef.current = Date.now();
      setIsRecording(true);
      
      // Also start Web Speech API for real-time interim transcripts
      if (speechRecognitionSupported) {
        startSpeechRecognition();
        console.log('[Whisper] Web Speech API started for real-time transcripts');
      }
      
      console.log('[Whisper] Recording started');

      return true;
    } catch (err) {
      console.error('[Whisper] Failed to start recording:', err);
      setError('Mikrofon erişimi reddedildi');
      onError?.('Mikrofon erişimi reddedildi');
      return false;
    }
  }, [onError, speechRecognitionSupported, startSpeechRecognition]);

  /**
   * Stop recording and get transcript
   */
  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        console.log('[Whisper] Not recording');
        resolve(null);
        return;
      }

      // Check minimum recording time
      const recordedSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
      if (recordedSeconds < MIN_RECORDING_SECONDS) {
        console.log(`[Whisper] Recording too short: ${recordedSeconds}s < ${MIN_RECORDING_SECONDS}s`);
        setError(`En az ${MIN_RECORDING_SECONDS} saniye konuşun`);
        onError?.(`En az ${MIN_RECORDING_SECONDS} saniye konuşun`);
        // Don't stop, let user continue
        resolve(null);
        return;
      }

      const mediaRecorder = mediaRecorderRef.current;

      mediaRecorder.onstop = async () => {
        console.log('[Whisper] Recording stopped, processing...');
        setIsRecording(false);
        setIsProcessing(true);
        
        // Stop Web Speech API
        if (speechRecognitionSupported) {
          stopSpeechRecognition();
        }

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Create audio blob
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        console.log('[Whisper] Audio blob size:', audioBlob.size, 'bytes, chunks:', chunksRef.current.length);

        // Minimum ~10KB for meaningful speech (about 1-2 seconds)
        if (audioBlob.size < 10000) {
          console.log('[Whisper] Audio too short (<10KB), skipping');
          setIsProcessing(false);
          setError('Kayıt çok kısa. Daha uzun konuşun.');
          onError?.('Kayıt çok kısa');
          resolve(null);
          return;
        }

        try {
          // Send to backend for Whisper transcription
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');
          formData.append('language', language);
          if (contextPrompt) {
            formData.append('prompt', contextPrompt);
          }
          // Recording için session bilgisi
          const storeState = useInterviewStore.getState();
          const sessionId = storeState.session?.sessionId;
          if (sessionId) {
            formData.append('sessionId', sessionId);
            const timestampMs = storeState.elapsedSeconds * 1000;
            formData.append('timestampMs', String(timestampMs));
          }

          const response = await fetch(`${API_URL}/transcribe`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();
          const transcript = data.text || '';

          console.log('[Whisper] Transcript:', transcript);
          
          // Add network metric from response
          if (data.metric) {
            const metric: NetworkMetric = {
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              service: 'whisper',
              operation: data.metric.operation || 'speech_to_text',
              durationMs: data.metric.durationMs,
              inputSize: data.metric.inputSize,
              outputSize: data.metric.outputSize,
              timestamp: Date.now(),
              metadata: { 
                model: data.metric.model,
                audioLengthMs: data.metric.audioLengthMs,
              },
            };
            addNetworkMetric(metric);
            console.log(`[Whisper] Metric: ${metric.durationMs}ms, input: ${metric.inputSize}B, audio: ~${Math.round((data.metric.audioLengthMs || 0) / 1000)}s`);
          }
          
          setIsProcessing(false);

          if (transcript) {
            onTranscript?.(transcript);
          }

          resolve(transcript);
        } catch (err) {
          console.error('[Whisper] Transcription error:', err);
          setError('Transkripsiyon hatası');
          onError?.('Transkripsiyon hatası');
          setIsProcessing(false);
          resolve(null);
        }
      };

      mediaRecorder.stop();
    });
  }, [language, onTranscript, onError, speechRecognitionSupported, stopSpeechRecognition, addNetworkMetric]);

  return {
    startRecording,
    stopRecording,
    isRecording,
    isProcessing,
    recordingSeconds,
    interimTranscript,
    error,
  };
}
