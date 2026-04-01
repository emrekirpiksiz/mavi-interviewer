'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWebSocket } from './useWebSocket';
import { useWhisper } from './useWhisper';
import { useSimli, SIMLI_CONFIG } from './useSimli';
import { useCamera } from './useCamera';
import { useFaceDetection, type FaceDetectionDebugData } from './useFaceDetection';
import { useVideoRecording } from './useVideoRecording';
import { useInterviewStore } from '../stores/interviewStore';
import { sessionLogger } from '@/lib/sessionLogger';
import type { WSTranscriptUpdateEvent, CameraIntegrityType } from '@ai-interview/shared';

// ============================================
// INTERVIEW ORCHESTRATOR HOOK
// ============================================
// Coordinates WebSocket, Simli Avatar (audio + lip-sync), and STT (Whisper)
// NOTE: Simli handles audio playback internally - no separate audio player needed

export interface UseInterviewOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export interface UseInterviewReturn {
  // Connection
  connect: (sessionId: string) => void;
  disconnect: () => void;
  isConnected: boolean;
  
  // Interview Control
  startInterview: () => void;
  endInterview: (reason: 'completed' | 'candidate_left' | 'technical_error') => void;
  interrupt: () => void;
  
  // Microphone Control
  startListening: () => Promise<boolean>;
  stopListening: () => Promise<void>;
  isListening: boolean;
  isProcessing: boolean;
  recordingSeconds: number;
  
  // Audio
  isAudioPlaying: boolean;
  
  // Simli Avatar
  initializeSimli: () => Promise<boolean>;
  closeSimli: () => void;
  isSimliReady: boolean;
  simliError: string | null;
  
  // Microphone Permission
  requestMicPermission: () => Promise<boolean>;
  
  // Camera
  requestCameraPermission: () => Promise<boolean>;
  cameraStream: MediaStream | null;
  cameraVideoRef: React.RefObject<HTMLVideoElement | null>;
  faceDetectionDebugData: FaceDetectionDebugData;
  
  // Reconnect
  resumeAfterReconnect: () => void;
}

export function useInterview(options?: UseInterviewOptions): UseInterviewReturn {
  const {
    connect: wsConnect,
    disconnect: wsDisconnect,
    send,
    isConnected,
    onAudioChunk,
  } = useWebSocket();

  // Simli Avatar - handles both lip-sync video AND audio playback
  const simliApiKey = process.env.NEXT_PUBLIC_SIMLI_API_KEY || '';
  const {
    initialize: initializeSimliClient,
    sendAudioToSimli,
    clearBuffer: clearSimliBuffer,
    close: closeSimli,
    isReady: isSimliReady,
    isSpeaking: isSimliSpeaking,
    error: simliError,
  } = useSimli({
    apiKey: simliApiKey,
    faceId: SIMLI_CONFIG.defaultFaceId,
    videoRef: options?.videoRef as React.RefObject<HTMLVideoElement | null>,
    audioRef: options?.audioRef as React.RefObject<HTMLAudioElement | null>,
  });

  // Track if audio is being sent/played (Simli handles actual playback)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const audioProcessingRef = useRef(false);
  const pendingAudioRef = useRef<Uint8Array | null>(null);

  // Get state from store
  const interviewState = useInterviewStore((state) => state.interviewState);
  const session = useInterviewStore((state) => state.session);
  const currentTurn = useInterviewStore((state) => state.currentTurn);
  const isReconnect = useInterviewStore((state) => state.isReconnect);
  const pageState = useInterviewStore((state) => state.pageState);
  const setMicPermission = useInterviewStore((state) => state.setMicPermission);
  const setInterviewState = useInterviewStore((state) => state.setInterviewState);
  const setPartialTranscript = useInterviewStore((state) => state.setPartialTranscript);
  const addTranscriptEntry = useInterviewStore((state) => state.addTranscriptEntry);
  const currentPhase = useInterviewStore((state) => state.currentPhase);
  const setSystemMessage = useInterviewStore((state) => state.setSystemMessage);
  const setPageState = useInterviewStore((state) => state.setPageState);
  const setReconnectStep = useInterviewStore((state) => state.setReconnectStep);
  const setIsReconnect = useInterviewStore((state) => state.setIsReconnect);

  // ===== CAMERA =====
  const cameraEnabled = useInterviewStore((state) => state.cameraEnabled);
  const setCameraPermission = useInterviewStore((state) => state.setCameraPermission);
  const setFaceDetected = useInterviewStore((state) => state.setFaceDetected);
  const setGazeOnCamera = useInterviewStore((state) => state.setGazeOnCamera);
  const setCameraWarning = useInterviewStore((state) => state.setCameraWarning);
  const setVideoRecordingStatus = useInterviewStore((state) => state.setVideoRecordingStatus);

  const {
    stream: cameraStream,
    startCamera,
    stopCamera,
    requestPermission: requestCameraPermissionRaw,
  } = useCamera();

  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const interviewStartTimeRef = useRef<number | null>(null);

  const handleIntegrityChange = useCallback((type: CameraIntegrityType) => {
    if (type === 'face_lost') {
      setFaceDetected(false);
      setCameraWarning('face_lost');
    } else if (type === 'face_restored') {
      setFaceDetected(true);
      setCameraWarning(null);
    } else if (type === 'gaze_away') {
      setGazeOnCamera(false);
      setCameraWarning('gaze_away');
    } else if (type === 'gaze_restored') {
      setGazeOnCamera(true);
      setCameraWarning(null);
    } else if (type === 'multi_face') {
      setCameraWarning('multi_face');
    } else if (type === 'multi_face_restored') {
      setCameraWarning(null);
    }

    const now = Date.now();
    const interviewSecond = interviewStartTimeRef.current
      ? Math.round((now - interviewStartTimeRef.current) / 1000)
      : undefined;

    send({ event: 'camera:integrity', data: { type, timestamp: now, interviewSecond } });
  }, [send, setFaceDetected, setGazeOnCamera, setCameraWarning]);

  const {
    start: startFaceDetection,
    stop: stopFaceDetection,
    debugData: faceDetectionDebugData,
  } = useFaceDetection(undefined, handleIntegrityChange);

  const {
    startRecording: startVideoRecording,
    stopRecording: stopVideoRecording,
    uploadVideo,
  } = useVideoRecording();

  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    const granted = await requestCameraPermissionRaw();
    setCameraPermission(granted ? 'granted' : 'denied');
    return granted;
  }, [requestCameraPermissionRaw, setCameraPermission]);

  // Start camera stream + video recording when interview goes active
  useEffect(() => {
    if (pageState === 'active' && cameraEnabled && cameraStream === null) {
      const initCamera = async () => {
        const stream = await startCamera();
        if (stream) {
          startVideoRecording(stream);
          setVideoRecordingStatus('recording');
        }
      };
      initCamera();
    }
  }, [pageState, cameraEnabled, cameraStream, startCamera, startVideoRecording, setVideoRecordingStatus]);

  // Start face detection once the <video> element is mounted and has loaded data.
  // Polls cameraVideoRef because the element is conditionally rendered in CameraPreview
  // and isn't available synchronously after the stream is created.
  const faceDetectionStartedRef = useRef(false);
  useEffect(() => {
    if (!cameraEnabled || !cameraStream || faceDetectionStartedRef.current) return;

    const tryStart = () => {
      const videoEl = cameraVideoRef.current;
      if (videoEl && videoEl.readyState >= 2) {
        faceDetectionStartedRef.current = true;
        console.log('[Interview] Camera video ready (readyState=%d), starting face detection', videoEl.readyState);
        startFaceDetection(videoEl).catch((err) =>
          console.error('[Interview] Face detection init failed:', err)
        );
        return true;
      }
      return false;
    };

    if (tryStart()) return;

    // Video element not ready yet — poll until it is
    const interval = setInterval(() => {
      if (tryStart()) clearInterval(interval);
    }, 100);

    return () => clearInterval(interval);
  }, [cameraEnabled, cameraStream, startFaceDetection]);

  // Track audio chunks for debugging
  const audioChunkCountRef = useRef(0);

  // Build context prompt for Whisper based on session info
  const whisperContextPrompt = session 
    ? `Şirket: ${session.companyName}. Pozisyon: ${session.positionTitle}. Aday: ${session.candidateName}.`
    : '';

  // Whisper hook for STT with real-time interim transcripts
  const {
    startRecording,
    stopRecording,
    isRecording,
    isProcessing,
    recordingSeconds,
    interimTranscript,
  } = useWhisper({
    language: 'tr',
    contextPrompt: whisperContextPrompt,
    onTranscript: (text) => {
      console.log('[Interview] Whisper transcript:', text);
      
      if (!text.trim()) return;
      
      // Send transcript to backend
      const event: WSTranscriptUpdateEvent = {
        event: 'transcript:update',
        data: { text, isFinal: true }
      };
      send(event);
      
      // Add to local transcript
      addTranscriptEntry({
        speaker: 'candidate',
        content: text,
        phase: currentPhase,
      });
      
      // Clear partial
      setPartialTranscript('');
      
      // Send speaking end
      send({ event: 'candidate:speaking:end', data: {} });
    },
    onInterimTranscript: (text) => {
      // Show real-time transcript while speaking
      if (text.trim()) {
        setPartialTranscript(text);
      }
    },
    onError: (error) => {
      console.error('[Interview] Whisper error:', error);
    },
  });

  // Update partial transcript when interim changes
  useEffect(() => {
    if (isRecording && interimTranscript) {
      setPartialTranscript(interimTranscript);
    }
  }, [isRecording, interimTranscript, setPartialTranscript]);

  /**
   * Connect to interview session
   */
  const connect = useCallback((sessionId: string) => {
    wsConnect(sessionId);
  }, [wsConnect]);

  /**
   * Disconnect from interview session
   */
  const disconnect = useCallback(() => {
    clearSimliBuffer();
    closeSimli();
    stopFaceDetection();
    stopCamera();
    wsDisconnect();
    setIsAudioPlaying(false);
    faceDetectionStartedRef.current = false;
    interviewStartTimeRef.current = null;
  }, [wsDisconnect, clearSimliBuffer, closeSimli, stopFaceDetection, stopCamera]);

  /**
   * Start the interview
   */
  const startInterview = useCallback(() => {
    interviewStartTimeRef.current = Date.now();
    setSystemMessage('AI mülakatçı hazırlanıyor...');
    send({ event: 'interview:start', data: {} });
  }, [send, setSystemMessage]);

  /**
   * End the interview
   */
  const endInterview = useCallback((reason: 'completed' | 'candidate_left' | 'technical_error') => {
    clearSimliBuffer();
    setIsAudioPlaying(false);
    send({ event: 'interview:end', data: { reason } });

    // Stop camera and upload video
    if (cameraEnabled) {
      stopFaceDetection();
      stopVideoRecording();
      stopCamera();
      setVideoRecordingStatus('processing');

      const sessionId = useInterviewStore.getState().session?.sessionId;
      if (sessionId) {
        uploadVideo(sessionId).then((ok) => {
          setVideoRecordingStatus(ok ? 'completed' : 'failed');
        });
      }
    }
  }, [send, clearSimliBuffer, cameraEnabled, stopFaceDetection, stopVideoRecording, stopCamera, uploadVideo, setVideoRecordingStatus]);

  /**
   * Interrupt AI speaking
   */
  const interrupt = useCallback(() => {
    clearSimliBuffer();
    setIsAudioPlaying(false);
    send({ event: 'candidate:interrupt', data: {} });
  }, [send, clearSimliBuffer]);

  /**
   * Initialize Simli avatar
   */
  const initializeSimli = useCallback(async (): Promise<boolean> => {
    console.log('[Interview] Simli API key:', simliApiKey ? `${simliApiKey.substring(0, 8)}...` : 'NOT SET');
    console.log('[Interview] Simli Face ID:', SIMLI_CONFIG.defaultFaceId);
    
    setSystemMessage('Görüşme asistanınız yükleniyor...');
    
    if (!simliApiKey) {
      console.warn('[Interview] Simli API key not configured, avatar disabled');
      setSystemMessage(null);
      return false;
    }
    
    const result = await initializeSimliClient();
    
    if (result) {
      setSystemMessage('Avatar hazır, görüşme başlatılıyor...');
    } else {
      setSystemMessage(null);
    }
    
    return result;
  }, [simliApiKey, initializeSimliClient, setSystemMessage]);

  /**
   * Handle reconnect resume flow
   * Called when Simli avatar is ready during reconnect
   * Sends interview:resume to backend and transitions to active state
   */
  const handleReconnectResume = useCallback(() => {
    console.log('[Interview] Reconnect resume - sending interview:resume');
    setReconnectStep('resuming');
    
    // Send interview:resume event to backend
    send({ event: 'interview:resume', data: {} });
    
    // Transition to active state
    setPageState('active');
    setInterviewState('ai_generating');
    setReconnectStep('done');
    setIsReconnect(false);
    
    console.log('[Interview] Reconnect resume complete - now active');
  }, [send, setPageState, setInterviewState, setReconnectStep, setIsReconnect]);

  /**
   * Start listening (recording) for candidate speech
   */
  const startListening = useCallback(async (): Promise<boolean> => {
    console.log('[Interview] Starting recording...');
    const success = await startRecording();
    if (success) {
      send({ event: 'candidate:speaking:start', data: {} });
      setInterviewState('candidate_speaking');
      // Partial transcript will be updated in real-time by Web Speech API
      setPartialTranscript('Dinleniyor...');
    }
    return success;
  }, [startRecording, send, setInterviewState, setPartialTranscript]);

  /**
   * Stop listening and process with Whisper
   */
  const stopListening = useCallback(async () => {
    console.log('[Interview] Stopping recording, processing with Whisper...');
    setInterviewState('processing');
    setPartialTranscript('İşleniyor...');
    await stopRecording();
  }, [stopRecording, setPartialTranscript, setInterviewState]);

  /**
   * Request microphone permission
   */
  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicPermission('granted');
      return true;
    } catch (error) {
      console.error('[Interview] Microphone permission denied:', error);
      setMicPermission('denied');
      return false;
    }
  }, [setMicPermission]);

  /**
   * Fallback: Play PCM16 audio via Web Audio API when Simli is unavailable
   */
  const playPcm16Fallback = useCallback(async (audioData: Uint8Array): Promise<number> => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 16000 });

      const pcm16 = new Int16Array(audioData.buffer, audioData.byteOffset, audioData.length / 2);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i]! / 32768;
      }

      const buffer = ctx.createBuffer(1, float32.length, 16000);
      buffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const durationMs = (float32.length / 16000) * 1000;

      return new Promise<number>((resolve) => {
        source.onended = () => {
          ctx.close().catch(() => {});
          resolve(durationMs);
        };
        source.start(0);
      });
    } catch (err) {
      console.error('[Interview] Fallback audio playback failed:', err);
      const durationMs = (audioData.length / 32000) * 1000;
      await new Promise(resolve => setTimeout(resolve, durationMs + 500));
      return durationMs;
    }
  }, []);

  /**
   * Process audio data - send to Simli or play via fallback
   */
  const processAudio = useCallback(async (audioData: Uint8Array) => {
    sessionLogger.log('info', 'audio', 'audio:processing', { bytes: audioData.length });
    
    if (isSimliReady) {
      const audioDurationMs = await sendAudioToSimli(audioData);
      sessionLogger.log('info', 'audio', 'audio:sent-to-simli', { durationMs: audioDurationMs });
      
      const waitTime = audioDurationMs + 500;
      sessionLogger.log('debug', 'audio', 'audio:waiting', { waitMs: waitTime });
      await new Promise(resolve => setTimeout(resolve, waitTime));
    } else {
      console.log(`[Interview] Simli unavailable, using fallback audio player`);
      const audioDurationMs = await playPcm16Fallback(audioData);
      sessionLogger.log('info', 'audio', 'audio:fallback-played', { durationMs: audioDurationMs });
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }, [isSimliReady, sendAudioToSimli, playPcm16Fallback]);

  /**
   * Set up audio chunk handler - receive full audio and send to Simli
   * Backend now sends complete audio buffer, not streaming chunks
   * Turn determines whether to activate mic after audio finishes
   * 
   * CRITICAL: Process ALL pending audio before changing state to prevent
   * race condition where mic is activated while audio is still pending
   */
  useEffect(() => {
    onAudioChunk(async (chunk) => {
      // Prevent concurrent processing - store for later
      if (audioProcessingRef.current) {
        console.log('[Interview] Audio already processing, storing for later');
        pendingAudioRef.current = new Uint8Array(chunk);
        return;
      }
      
      audioProcessingRef.current = true;
      setIsAudioPlaying(true);
      
      const audioData = new Uint8Array(chunk);
      await processAudio(audioData);
      
      // IMPORTANT: Process ALL pending audio BEFORE changing state
      // This prevents race condition where mic activates while pending audio exists
      while (pendingAudioRef.current) {
        const pending = pendingAudioRef.current;
        pendingAudioRef.current = null;
        sessionLogger.log('info', 'audio', 'audio:processing-pending', { bytes: pending.length });
        await processAudio(pending);
      }
      
      // ALL audio finished - now safe to change state
      setIsAudioPlaying(false);
      audioProcessingRef.current = false;
      
      // Check current turn to determine next state
      // Get latest turn value from store (not from closure)
      const latestTurn = useInterviewStore.getState().currentTurn;
      
      if (latestTurn === 'candidate') {
        // Sıra adayda - mikrofon açılacak
        sessionLogger.log('info', 'interview', 'audio:finished:turn-candidate', { action: 'activating-mic' });
        setInterviewState('waiting_candidate');
      } else {
        // Sıra AI'da - AI devam edecek, mikrofon açılmayacak
        sessionLogger.log('info', 'interview', 'audio:finished:turn-ai', { action: 'waiting-for-ai' });
        // Backend will send next ai:generating:start/ai:speaking:start automatically
        // Keep state as ai_speaking or change to ai_generating
        setInterviewState('ai_generating');
      }
    });
  }, [onAudioChunk, processAudio, setInterviewState]);

  /**
   * Auto-start recording when AI finishes speaking AND turn is 'candidate'
   * IMPORTANT: Only activate mic when it's candidate's turn AND no audio is being processed!
   */
  useEffect(() => {
    // Double-check that no audio is being processed (including pending)
    const isAudioProcessing = audioProcessingRef.current || pendingAudioRef.current !== null;
    
    if (
      interviewState === 'waiting_candidate' && 
      currentTurn === 'candidate' && // CRITICAL: Only if it's candidate's turn
      isConnected && 
      !isAudioPlaying &&
      !isAudioProcessing && // CRITICAL: No audio being processed
      !isRecording &&
      !isProcessing
    ) {
      const timeout = setTimeout(() => {
        // Final check before starting - in case state changed during timeout
        const finalTurn = useInterviewStore.getState().currentTurn;
        const finalState = useInterviewStore.getState().interviewState;
        
        if (finalTurn === 'candidate' && finalState === 'waiting_candidate' && !audioProcessingRef.current) {
          console.log('[Interview] Auto-starting recording (turn is CANDIDATE, no audio processing)');
          startListening();
        } else {
          console.log('[Interview] Skipping auto-start - conditions changed', { finalTurn, finalState });
        }
      }, 200); // Slightly longer delay for safety
      
      return () => clearTimeout(timeout);
    }
  }, [interviewState, currentTurn, isConnected, isAudioPlaying, isRecording, isProcessing, startListening]);

  // NOT: Reconnect resume artık otomatik tetiklenmiyor.
  // Tarayıcı autoplay politikası nedeniyle kullanıcı etkileşimi (tıklama) gerekli.
  // ActiveScreen'deki "Görüşmeye Devam Et" butonu handleReconnectResume'u çağıracak.

  return {
    connect,
    disconnect,
    isConnected,
    
    startInterview,
    endInterview,
    interrupt,
    
    startListening,
    stopListening,
    isListening: isRecording,
    isProcessing,
    recordingSeconds,
    
    isAudioPlaying,
    
    initializeSimli,
    closeSimli,
    isSimliReady,
    simliError,
    
    requestMicPermission,
    
    // Camera
    requestCameraPermission,
    cameraStream,
    cameraVideoRef,
    faceDetectionDebugData,
    
    resumeAfterReconnect: handleReconnectResume,
  };
}
