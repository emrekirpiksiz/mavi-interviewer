'use client';

import { useCallback, useRef, useEffect, useState } from 'react';

// ============================================
// WEB SPEECH RECOGNITION HOOK
// ============================================
// Browser-based speech recognition for real-time interim transcripts
// Uses SpeechRecognition API (Chrome, Edge, Safari)

// Type declarations for Web Speech API
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface ISpeechRecognitionEvent {
  resultIndex: number;
  results: ISpeechRecognitionResultList;
}

interface ISpeechRecognitionResultList {
  length: number;
  [index: number]: ISpeechRecognitionResult;
}

interface ISpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: ISpeechRecognitionAlternative;
}

interface ISpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface ISpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface UseSpeechRecognitionOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onError?: (error: string) => void;
}

interface UseSpeechRecognitionReturn {
  start: () => boolean;
  stop: () => void;
  isSupported: boolean;
  isListening: boolean;
  interimTranscript: string;
}

// Check for Web Speech API support
const getSpeechRecognition = (): (new () => ISpeechRecognition) | null => {
  if (typeof window === 'undefined') return null;
  
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
};

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const {
    language = 'tr-TR',
    continuous = true,
    interimResults = true,
    onInterimTranscript,
    onFinalTranscript,
    onError,
  } = options;

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');

  // Store callbacks in refs to avoid re-creating the recognition instance
  const onInterimRef = useRef(onInterimTranscript);
  const onFinalRef = useRef(onFinalTranscript);
  const onErrorRef = useRef(onError);
  onInterimRef.current = onInterimTranscript;
  onFinalRef.current = onFinalTranscript;
  onErrorRef.current = onError;
  
  const SpeechRecognitionClass = getSpeechRecognition();
  const isSupported = SpeechRecognitionClass !== null;

  // Initialize recognition instance (only when config changes, not callbacks)
  useEffect(() => {
    if (!SpeechRecognitionClass) return;

    const recognition = new SpeechRecognitionClass();
    recognition.lang = language;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (interim) {
        setInterimTranscript(interim);
        onInterimRef.current?.(interim);
      }

      if (final) {
        setInterimTranscript('');
        onFinalRef.current?.(final);
      }
    };

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      console.error('[SpeechRecognition] Error:', event.error);
      onErrorRef.current?.(event.error);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore errors when stopping
        }
      }
    };
  }, [SpeechRecognitionClass, language, continuous, interimResults]);

  // Start recognition
  const start = useCallback((): boolean => {
    if (!recognitionRef.current) {
      console.warn('[SpeechRecognition] Not supported in this browser');
      return false;
    }

    try {
      recognitionRef.current.start();
      setIsListening(true);
      setInterimTranscript('');
      console.log('[SpeechRecognition] Started');
      return true;
    } catch (error) {
      console.error('[SpeechRecognition] Start error:', error);
      return false;
    }
  }, []);

  // Stop recognition
  const stop = useCallback(() => {
    if (!recognitionRef.current) return;

    try {
      recognitionRef.current.stop();
      setIsListening(false);
      setInterimTranscript('');
      console.log('[SpeechRecognition] Stopped');
    } catch (error) {
      console.error('[SpeechRecognition] Stop error:', error);
    }
  }, []);

  return {
    start,
    stop,
    isSupported,
    isListening,
    interimTranscript,
  };
}
