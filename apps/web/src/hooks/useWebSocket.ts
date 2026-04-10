'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useInterviewStore } from '../stores/interviewStore';
import { sessionLogger } from '@/lib/sessionLogger';
import type {
  WSClientEvent,
  WSServerEvent,
  WSConnectionReadyEvent,
  WSAiGeneratingStartEvent,
  WSAiGeneratingEndEvent,
  WSAiSpeakingStartEvent,
  WSAiSpeakingEndEvent,
  WSPhaseChangedEvent,
  WSInterviewEndedEvent,
  WSErrorEvent,
  WSNetworkMetricEvent,
  WSRecordingStatusEvent,
  WSTranscriptValidatedEvent,
  WSTranscriptRejectedEvent,
} from '@ai-interview/shared';

// ============================================
// WEBSOCKET HOOK
// ============================================

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:2223/ws';

export interface UseWebSocketReturn {
  connect: (sessionId: string) => void;
  disconnect: () => void;
  send: <T extends WSClientEvent>(event: T) => boolean;
  isConnected: boolean;
  onAudioChunk: (callback: (chunk: ArrayBuffer) => void) => void;
}

// Reconnect configuration
const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000; // 1 second
const RECONNECT_MAX_DELAY = 30000; // 30 seconds

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const audioChunkCallbackRef = useRef<((chunk: ArrayBuffer) => void) | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isIntentionalDisconnectRef = useRef(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:2223';

  // Get store actions
  const {
    setSession,
    setWsConnected,
    setPageState,
    setError,
    setInterviewState,
    setPhase,
    setCurrentTurn,
    setIsReconnect,
    setReconnectStep,
    addTranscriptEntry,
    addNetworkMetric,
    setSystemMessage,
    loadExistingTranscript,
    setElapsedSeconds,
    setRecordingStatus,
    setSessionSettings,
    setCallbackDebug,
    wsConnected,
  } = useInterviewStore();

  /**
   * Handle incoming WebSocket messages
   */
  const handleMessage = useCallback((event: MessageEvent) => {
    // Handle binary messages (audio chunks)
    if (event.data instanceof ArrayBuffer) {
      if (audioChunkCallbackRef.current) {
        audioChunkCallbackRef.current(event.data);
      }
      return;
    }

    // Handle Blob messages (convert to ArrayBuffer)
    if (event.data instanceof Blob) {
      event.data.arrayBuffer().then((buffer) => {
        if (audioChunkCallbackRef.current) {
          audioChunkCallbackRef.current(buffer);
        }
      });
      return;
    }

    // Handle JSON messages
    try {
      const message = JSON.parse(event.data) as WSServerEvent;
      sessionLogger.logWS('in', message.event, (message as { data?: unknown }).data);

      switch (message.event) {
        case 'connection:ready':
          handleConnectionReady(message);
          break;
        case 'connection:error':
          handleConnectionError(message);
          break;
        case 'ai:generating:start':
          handleAiGeneratingStart();
          break;
        case 'ai:generating:end':
          handleAiGeneratingEnd();
          break;
        case 'ai:speaking:start':
          handleAiSpeakingStart(message);
          break;
        case 'ai:speaking:end':
          handleAiSpeakingEnd();
          break;
        case 'phase:changed':
          handlePhaseChanged(message);
          break;
        case 'interview:ended':
          handleInterviewEnded(message);
          break;
        case 'error':
          handleError(message);
          break;
        case 'network:metric':
          handleNetworkMetric(message as WSNetworkMetricEvent);
          break;
        case 'recording:status':
          handleRecordingStatus(message as WSRecordingStatusEvent);
          break;
        case 'transcript:validated':
          handleTranscriptValidated(message as WSTranscriptValidatedEvent);
          break;
        case 'transcript:rejected':
          handleTranscriptRejected(message as WSTranscriptRejectedEvent);
          break;
        case 'video:recording:status':
          console.log('[WebSocket] Video recording status:', (message as { data: unknown }).data);
          break;
        case 'callback:debug' as string:
          handleCallbackDebug(message as unknown as { event: string; data: import('../stores/interviewStore').CallbackDebugInfo });
          break;
        default:
          console.warn('[WebSocket] Unknown event:', (message as WSServerEvent).event);
      }
    } catch (error) {
      console.error('[WebSocket] Error parsing message:', error);
    }
  }, []);

  /**
   * Handle connection:ready event
   * Supports reconnection with existing transcript
   */
  const handleConnectionReady = useCallback((message: WSConnectionReadyEvent) => {
    const { data } = message;
    
    setSession({
      sessionId: data.sessionId,
      candidateName: data.candidate.name,
      assessmentTitle: data.assessment.title,
      totalQuestions: data.totalQuestions,
      status: data.status,
      currentPhase: data.currentPhase,
      currentQuestionIndex: data.currentQuestionIndex,
    });

    if (data.settings) {
      setSessionSettings(data.settings);
    }

    setWsConnected(true);
    setPhase(data.currentPhase);
    
    if (data.isReconnect && data.status === 'active') {
      console.log('[WebSocket] Reconnecting to active session:', data.sessionId);
      
      setIsReconnect(true);
      setReconnectStep('ws_connected');
      
      if (data.existingTranscript && data.existingTranscript.length > 0) {
        loadExistingTranscript(data.existingTranscript);
        console.log(`[WebSocket] Loaded ${data.existingTranscript.length} existing transcript entries`);
      }
      setReconnectStep('transcript_loaded');
      
      if (data.elapsedSeconds) {
        setElapsedSeconds(data.elapsedSeconds);
      }
      
      const currentState = useInterviewStore.getState().pageState;
      if (currentState === 'loading' || currentState === 'reconnecting') {
        setPageState('active');
        console.log('[WebSocket] Reconnect: Transitioning to active for Simli init');
      }
      
    } else {
      setIsReconnect(false);
      
      const currentState = useInterviewStore.getState().pageState;
      if (currentState === 'loading') {
        setPageState('setup');
      }
    }

    console.log('[WebSocket] Connection ready for session:', data.sessionId, 
      data.isReconnect ? '(reconnect)' : '(new)');
  }, [setSession, setWsConnected, setPhase, setPageState, setInterviewState, 
      loadExistingTranscript, setElapsedSeconds, setSystemMessage, setIsReconnect, setReconnectStep, setSessionSettings]);

  /**
   * Handle connection:error event
   */
  const handleConnectionError = useCallback((message: { data: { code: string; message: string } }) => {
    console.error('[WebSocket] Connection error:', message.data);
    setError(message.data.message);
    setWsConnected(false);
  }, [setError, setWsConnected]);

  /**
   * Handle ai:generating:start event
   */
  const handleAiGeneratingStart = useCallback(() => {
    setInterviewState('ai_generating');
    setSystemMessage('AI düşünüyor...');
  }, [setInterviewState, setSystemMessage]);

  /**
   * Handle ai:generating:end event
   */
  const handleAiGeneratingEnd = useCallback(() => {
    // Don't change state here - it will be set by ai:speaking:start
    // Just update the system message
    setSystemMessage('Yanıt hazırlanıyor...');
  }, [setSystemMessage]);

  /**
   * Handle ai:speaking:start event
   */
  const handleAiSpeakingStart = useCallback((message: WSAiSpeakingStartEvent) => {
    setInterviewState('ai_speaking');
    setSystemMessage(null); // Clear any loading message
    
    // Set whose turn it is (determines whether mic should activate after audio)
    // 'candidate' = mic will activate, 'ai' = AI will continue speaking
    setCurrentTurn(message.data.turn);
    console.log('[WebSocket] Turn set to:', message.data.turn);
    
    addTranscriptEntry({
      speaker: 'ai',
      content: message.data.text,
      phase: message.data.phase,
    });
  }, [setInterviewState, addTranscriptEntry, setSystemMessage, setCurrentTurn]);

  /**
   * Handle ai:speaking:end event
   * Note: We don't change state here - let audio player finishing trigger the state change
   * This prevents "listening" state showing while audio is still buffered/playing
   */
  const handleAiSpeakingEnd = useCallback(() => {
    console.log('[WebSocket] AI speaking end received - waiting for audio playback to finish');
    // State change will happen in useInterview when audio playback actually ends
  }, []);

  /**
   * Handle phase:changed event
   */
  const handlePhaseChanged = useCallback((message: WSPhaseChangedEvent) => {
    setPhase(message.data.to);
    console.log('[WebSocket] Phase changed:', message.data.from, '->', message.data.to);
  }, [setPhase]);

  /**
   * Handle interview:ended event
   * Transition to 'closing' state first - audio may still be playing.
   * ActiveScreen will transition to 'completed' after audio finishes.
   */
  const handleInterviewEnded = useCallback((message: WSInterviewEndedEvent) => {
    console.log('[WebSocket] Interview ended:', message.data.reason);
    setPageState('closing');
  }, [setPageState]);

  /**
   * Handle error event
   */
  const handleError = useCallback((message: WSErrorEvent) => {
    sessionLogger.log('error', 'error', 'ws:error', message.data);
    
    if (!message.data.recoverable) {
      setError(message.data.message);
    } else {
      // For recoverable errors, log and reset state so user can continue
      sessionLogger.log('warn', 'error', 'ws:error:recoverable', { message: message.data.message });
      
      // Reset state to waiting_candidate so interview can continue
      // This handles cases where AI generation fails mid-way
      setInterviewState('waiting_candidate');
      setCurrentTurn('candidate');
      setSystemMessage(`Hata: ${message.data.message}. Tekrar deneyin.`);
    }
  }, [setError, setInterviewState, setCurrentTurn, setSystemMessage]);

  /**
   * Handle network:metric event
   */
  const handleNetworkMetric = useCallback((message: WSNetworkMetricEvent) => {
    sessionLogger.logMetric(message.data.service, message.data.operation, message.data.durationMs);
    addNetworkMetric(message.data);
  }, [addNetworkMetric]);

  /**
   * Handle recording:status event
   */
  const handleRecordingStatus = useCallback((message: WSRecordingStatusEvent) => {
    const { status, message: msg, error } = message.data;
    console.log(`[WebSocket] Recording status: ${status} - ${msg}`, error ? `Error: ${error}` : '');
    setRecordingStatus(status, msg, error);
  }, [setRecordingStatus]);

  /**
   * Handle transcript:validated event - backend confirmed the transcript is meaningful
   */
  const handleTranscriptValidated = useCallback((message: WSTranscriptValidatedEvent) => {
    console.log('[WebSocket] Transcript validated:', message.data.text.substring(0, 60));
    addTranscriptEntry({
      speaker: 'candidate',
      content: message.data.text,
      phase: message.data.phase,
    });
  }, [addTranscriptEntry]);

  /**
   * Handle transcript:rejected event - backend determined STT output was nonsensical
   */
  const handleTranscriptRejected = useCallback((message: WSTranscriptRejectedEvent) => {
    console.log('[WebSocket] Transcript rejected');
    addTranscriptEntry({
      speaker: 'candidate',
      content: '(Anlamsız cevap)',
      phase: message.data.phase,
    });
  }, [addTranscriptEntry]);

  /**
   * Handle callback:debug event
   */
  const handleCallbackDebug = useCallback((message: { event: string; data: import('../stores/interviewStore').CallbackDebugInfo }) => {
    console.log('[WebSocket] Callback debug:', message.data.success ? 'SUCCESS' : 'FAILED');
    setCallbackDebug(message.data);
  }, [setCallbackDebug]);

  /**
   * Attempt to reconnect with exponential backoff
   */
  const attemptReconnect = useCallback(() => {
    if (!sessionIdRef.current) return;
    if (isIntentionalDisconnectRef.current) return;
    if (reconnectAttemptsRef.current >= RECONNECT_MAX_ATTEMPTS) {
      console.log('[WebSocket] Max reconnect attempts reached');
      setError('Bağlantı kurulamadı. Lütfen sayfayı yenileyin.');
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptsRef.current),
      RECONNECT_MAX_DELAY
    );
    
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${RECONNECT_MAX_ATTEMPTS})`);
    setSystemMessage(`Yeniden bağlanılıyor... (${reconnectAttemptsRef.current + 1}/${RECONNECT_MAX_ATTEMPTS})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttemptsRef.current++;
      if (sessionIdRef.current) {
        connectInternal(sessionIdRef.current);
      }
    }, delay);
  }, [setError, setSystemMessage]);

  /**
   * Internal connect function
   */
  const connectInternal = useCallback((sessionId: string) => {
    const url = `${WS_URL}?sessionId=${sessionId}`;
    
    console.log('[WebSocket] Connecting to:', url);

    try {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        reconnectAttemptsRef.current = 0; // Reset on successful connection
        setSystemMessage(null);
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        console.log('[WebSocket] Disconnected:', event.code, event.reason);

        // Ignore close events from stale WebSocket instances (React Strict Mode / rapid reconnect)
        if (wsRef.current !== null && wsRef.current !== ws) {
          console.log('[WebSocket] Ignoring close event from stale WebSocket instance');
          return;
        }

        setWsConnected(false);
        wsRef.current = null;
        
        // Session takeover - başka tarayıcıdan bağlanıldı
        if (event.code === 4010) {
          console.log('[WebSocket] Session taken over by another client');
          setError(null);
          setPageState('taken_over');
          setSystemMessage('Bu görüşme başka bir tarayıcıdan devam ettiriliyor.');
          return;
        }
        
        // Don't reconnect for certain close codes
        const noReconnectCodes = [1000, 4003, 4004, 4005];
        
        if (event.code === 4003) {
          setError('Görüşme bulunamadı');
        } else if (event.code === 4004) {
          setError('Bu görüşme zaten tamamlanmış');
        } else if (!noReconnectCodes.includes(event.code) && !isIntentionalDisconnectRef.current) {
          attemptReconnect();
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error);
      attemptReconnect();
    }
  }, [handleMessage, setWsConnected, setError, setSystemMessage, attemptReconnect]);

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback((sessionId: string) => {
    // Initialize session logger
    sessionLogger.init(sessionId);
    
    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Reset reconnect state
    reconnectAttemptsRef.current = 0;
    isIntentionalDisconnectRef.current = false;

    // Disconnect existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    sessionIdRef.current = sessionId;
    connectInternal(sessionId);
  }, [connectInternal]);

  /**
   * Disconnect from WebSocket server
   */
  const disconnect = useCallback(() => {
    // Mark as intentional disconnect to prevent reconnect attempts
    isIntentionalDisconnectRef.current = true;
    
    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      console.log('[WebSocket] Disconnecting...');
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
      sessionIdRef.current = null;
      setWsConnected(false);
    }
  }, [setWsConnected]);

  /**
   * Send event to WebSocket server
   */
  const send = useCallback(<T extends WSClientEvent>(event: T): boolean => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      sessionLogger.log('warn', 'websocket', 'ws:send:failed', { reason: 'not connected' });
      return false;
    }

    try {
      wsRef.current.send(JSON.stringify(event));
      sessionLogger.logWS('out', event.event, (event as { data?: unknown }).data);
      return true;
    } catch (error) {
      sessionLogger.logError('websocket', error, 'send');
      return false;
    }
  }, []);

  /**
   * Set callback for audio chunks
   */
  const onAudioChunk = useCallback((callback: (chunk: ArrayBuffer) => void) => {
    audioChunkCallbackRef.current = callback;
  }, []);

  /**
   * Browser close detection via sendBeacon
   */
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionIdRef.current) {
        // Best-effort: send beacon to backend
        const url = `${API_URL}/sessions/${sessionIdRef.current}/disconnect`;
        const data = JSON.stringify({ reason: 'browser_close' });
        navigator.sendBeacon(url, data);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [API_URL]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      isIntentionalDisconnectRef.current = true;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (wsRef.current) {
        wsRef.current.close(1001, 'Component unmount');
      }
    };
  }, []);

  return {
    connect,
    disconnect,
    send,
    isConnected: wsConnected,
    onAudioChunk,
  };
}
