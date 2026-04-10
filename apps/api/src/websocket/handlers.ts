import type { WebSocket } from 'ws';
import { connectionManager } from './connectionManager.js';
import type {
  WSClientEvent,
  WSInterviewStartEvent,
  WSInterviewEndEvent,
  WSInterviewResumeEvent,
  WSCandidateSpeakingStartEvent,
  WSCandidateSpeakingEndEvent,
  WSCandidateInterruptEvent,
  WSTranscriptUpdateEvent,
  WSCameraIntegrityEvent,
  WSErrorEvent,
  WSAiGeneratingStartEvent,
  WSAiGeneratingEndEvent,
  WSAiSpeakingStartEvent,
  WSAiSpeakingEndEvent,
  WSPhaseChangedEvent,
  WSInterviewEndedEvent,
  WSTranscriptValidatedEvent,
  WSTranscriptRejectedEvent,
  AssessmentPhase,
  CameraIntegrityType,
} from '@ai-interview/shared';
import { getSessionWithConfig, createSessionEvent } from '../services/sessionService.js';
import { buildSystemPrompt } from '../services/promptBuilder.js';
import {
  getFirstQuestion,
  getNextAction,
  getInterruptResponse,
  type AssessmentAction,
} from '../services/interviewEngine.js';
import {
  initializeSessionState,
  getSessionState,
  updateState,
  getElapsedMinutes,
  getPhaseQuestionCount,
  incrementPhaseQuestionCount,
  addToConversationHistory,
  getConversationHistory,
  startInterview,
  changePhase,
  endInterview,
  saveAIMessage,
  saveCandidateMessage,
  cleanupSessionState,
  loadStateFromDb,
  forceSetState,
} from '../services/stateMachine.js';
import { getLastTranscriptEntry } from '../db/queries/transcripts.js';
import { streamTTS, cancelTTS } from '../services/ttsService.js';
import {
  initRecording,
  finalizeRecording,
} from '../services/audioRecordingService.js';
import { registerPendingCallback } from '../services/callbackCoordinator.js';
import { validateTranscript } from '../services/sttValidator.js';
import { config } from '../config/index.js';

// ============================================
// WEBSOCKET EVENT HANDLERS
// ============================================

const VALID_EVENTS = [
  'interview:start',
  'interview:end',
  'interview:resume',
  'candidate:speaking:start',
  'candidate:speaking:end',
  'candidate:interrupt',
  'transcript:update',
  'camera:integrity',
] as const;

type ValidEventName = typeof VALID_EVENTS[number];

const systemPromptCache = new Map<string, string>();

// ============================================
// WEBSOCKET MESSAGE RATE LIMITING
// ============================================

const WS_MESSAGE_LIMIT = 60;
const WS_MESSAGE_WINDOW_MS = 60 * 1000;
const messageCounters = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of messageCounters.entries()) {
    if (now > data.resetAt) {
      messageCounters.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

function checkMessageRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const entry = messageCounters.get(sessionId);

  if (!entry || now > entry.resetAt) {
    messageCounters.set(sessionId, { count: 1, resetAt: now + WS_MESSAGE_WINDOW_MS });
    return true;
  }

  entry.count++;
  if (entry.count > WS_MESSAGE_LIMIT) {
    return false;
  }

  return true;
}

// ============================================
// STT VALIDATION RETRY TRACKING
// ============================================

const sttRetryCounters = new Map<string, number>();
const STT_MAX_RETRIES = 1;

function getSttRetryCount(sessionId: string): number {
  return sttRetryCounters.get(sessionId) || 0;
}

function incrementSttRetry(sessionId: string): void {
  sttRetryCounters.set(sessionId, getSttRetryCount(sessionId) + 1);
}

function resetSttRetry(sessionId: string): void {
  sttRetryCounters.delete(sessionId);
}

// ============================================
// MESSAGE VALIDATION
// ============================================

export function validateMessage(data: unknown): { valid: true; message: WSClientEvent } | { valid: false; error: string } {
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Message must be a JSON object' };
  }

  const message = data as Record<string, unknown>;
  const eventName = message['event'];
  const eventData = message['data'];

  if (!eventName || typeof eventName !== 'string') {
    return { valid: false, error: 'Missing or invalid event field' };
  }

  if (!VALID_EVENTS.includes(eventName as ValidEventName)) {
    return { valid: false, error: `Unknown event: ${eventName}` };
  }

  if (eventData === undefined) {
    return { valid: false, error: 'Missing data field' };
  }

  switch (eventName as ValidEventName) {
    case 'interview:end':
      return validateInterviewEndEvent(eventData);
    case 'transcript:update':
      return validateTranscriptUpdateEvent(eventData);
    case 'camera:integrity':
      return validateCameraIntegrityEvent(eventData);
    default:
      return { 
        valid: true, 
        message: { event: eventName, data: eventData } as unknown as WSClientEvent 
      };
  }
}

function validateInterviewEndEvent(eventData: unknown): { valid: true; message: WSInterviewEndEvent } | { valid: false; error: string } {
  if (typeof eventData !== 'object' || eventData === null) {
    return { valid: false, error: 'interview:end requires data object' };
  }

  const data = eventData as Record<string, unknown>;
  const reason = data['reason'];
  
  if (!reason || typeof reason !== 'string') {
    return { valid: false, error: 'interview:end requires reason field' };
  }

  const validReasons = ['completed', 'candidate_left', 'technical_error'];
  if (!validReasons.includes(reason)) {
    return { valid: false, error: `Invalid reason: ${reason}` };
  }

  return { 
    valid: true, 
    message: { event: 'interview:end', data: { reason } } as WSInterviewEndEvent 
  };
}

function validateTranscriptUpdateEvent(eventData: unknown): { valid: true; message: WSTranscriptUpdateEvent } | { valid: false; error: string } {
  if (typeof eventData !== 'object' || eventData === null) {
    return { valid: false, error: 'transcript:update requires data object' };
  }

  const data = eventData as Record<string, unknown>;
  const text = data['text'];
  const isFinal = data['isFinal'];

  if (typeof text !== 'string') {
    return { valid: false, error: 'transcript:update requires text field (string)' };
  }

  if (typeof isFinal !== 'boolean') {
    return { valid: false, error: 'transcript:update requires isFinal field (boolean)' };
  }

  return { 
    valid: true, 
    message: { event: 'transcript:update', data: { text, isFinal } } as WSTranscriptUpdateEvent 
  };
}

function validateCameraIntegrityEvent(eventData: unknown): { valid: true; message: WSCameraIntegrityEvent } | { valid: false; error: string } {
  if (typeof eventData !== 'object' || eventData === null) {
    return { valid: false, error: 'camera:integrity requires data object' };
  }

  const data = eventData as Record<string, unknown>;
  const type = data['type'];
  const timestamp = data['timestamp'];

  const validTypes: CameraIntegrityType[] = ['face_lost', 'face_restored', 'gaze_away', 'gaze_restored', 'multi_face', 'multi_face_restored'];
  if (typeof type !== 'string' || !validTypes.includes(type as CameraIntegrityType)) {
    return { valid: false, error: `Invalid camera integrity type: ${type}` };
  }

  if (typeof timestamp !== 'number') {
    return { valid: false, error: 'camera:integrity requires timestamp (number)' };
  }

  const interviewSecond = typeof data['interviewSecond'] === 'number' ? data['interviewSecond'] : undefined;

  return {
    valid: true,
    message: {
      event: 'camera:integrity',
      data: { type: type as CameraIntegrityType, timestamp, interviewSecond },
    },
  };
}

// ============================================
// EVENT DISPATCH
// ============================================

export async function handleEvent(sessionId: string, ws: WebSocket, event: WSClientEvent): Promise<void> {
  console.log(`[Handler] Session ${sessionId} - Processing event: ${event.event}`);

  if (!checkMessageRateLimit(sessionId)) {
    console.warn(`[Handler] Session ${sessionId} - Message rate limit exceeded`);
    sendError(ws, 'RATE_LIMIT_EXCEEDED', 'Too many messages, please slow down', true);
    return;
  }

  try {
    switch (event.event) {
      case 'interview:start':
        await handleInterviewStart(sessionId, ws);
        break;
      case 'interview:end':
        await handleInterviewEnd(sessionId, ws, event);
        break;
      case 'interview:resume':
        await handleInterviewResume(sessionId, ws);
        break;
      case 'candidate:speaking:start':
        handleCandidateSpeakingStart(sessionId);
        break;
      case 'candidate:speaking:end':
        break;
      case 'candidate:interrupt':
        await handleCandidateInterrupt(sessionId, ws);
        break;
      case 'transcript:update':
        await handleTranscriptUpdate(sessionId, ws, event);
        break;
      case 'camera:integrity':
        await handleCameraIntegrity(sessionId, event);
        break;
      default:
        console.warn(`[Handler] Session ${sessionId} - Unhandled event type`);
    }
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - Error handling event:`, error);
    sendError(ws, 'INTERNAL_ERROR', 'İşlem sırasında hata oluştu', true);
  }
}

export function sendError(ws: WebSocket, code: string, message: string, recoverable: boolean = true): void {
  const errorEvent: WSErrorEvent = {
    event: 'error',
    data: { code, message, recoverable }
  };

  try {
    ws.send(JSON.stringify(errorEvent));
  } catch (error) {
    console.error('[Handler] Error sending error event:', error);
  }
}

// ============================================
// EVENT HANDLERS
// ============================================

async function handleInterviewStart(sessionId: string, ws: WebSocket): Promise<void> {
  console.log(`[Handler] Session ${sessionId} - Assessment start requested`);
  
  try {
    const sessionData = await getSessionWithConfig(sessionId);
    if (!sessionData) {
      sendError(ws, 'SESSION_NOT_FOUND', 'Session bulunamadı', false);
      return;
    }
    
    const { session, config: assessmentConfig } = sessionData;
    
    if (session.status !== 'pending') {
      sendError(ws, 'SESSION_ALREADY_STARTED', 'Değerlendirme zaten başlamış', false);
      return;
    }
    
    let state = getSessionState(sessionId);
    if (!state) {
      state = initializeSessionState(sessionId, session);
    }
    
    const startedSession = await startInterview(sessionId);
    if (!startedSession) {
      sendError(ws, 'INTERNAL_ERROR', 'Değerlendirme başlatılamadı');
      return;
    }
    
    initRecording(sessionId).catch(error => {
      console.error(`[Handler] Session ${sessionId} - Recording init error:`, error);
    });
    
    const systemPrompt = buildSystemPrompt(assessmentConfig);
    systemPromptCache.set(sessionId, systemPrompt);
    
    const aiGeneratingStartEvent: WSAiGeneratingStartEvent = {
      event: 'ai:generating:start',
      data: {}
    };
    connectionManager.send(sessionId, aiGeneratingStartEvent);
    
    const action = await getFirstQuestion(session, assessmentConfig, systemPrompt, sessionId);
    
    const aiGeneratingEndEvent: WSAiGeneratingEndEvent = {
      event: 'ai:generating:end',
      data: {}
    };
    connectionManager.send(sessionId, aiGeneratingEndEvent);
    
    await processAssessmentAction(sessionId, ws, action);
    
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - Error starting assessment:`, error);
    connectionManager.send(sessionId, { event: 'ai:generating:end', data: {} });
    const errorMessage = error instanceof Error ? error.message : 'AI yanıt hatası oluştu';
    sendError(ws, 'LLM_ERROR', errorMessage, true);
    updateState(sessionId, 'WAITING_FOR_CANDIDATE');
  }
}

async function handleInterviewEnd(sessionId: string, ws: WebSocket, event: WSInterviewEndEvent): Promise<void> {
  console.log(`[Handler] Session ${sessionId} - Assessment end requested (reason: ${event.data.reason})`);

  try {
    const reason = event.data.reason;
    
    const session = await endInterview(sessionId, reason);
    if (!session) {
      sendError(ws, 'INTERNAL_ERROR', 'Değerlendirme sonlandırılamadı');
      return;
    }
    
    let totalMinutes = 0;
    if (session.startedAt && session.endedAt) {
      const start = new Date(session.startedAt).getTime();
      const end = new Date(session.endedAt).getTime();
      totalMinutes = Math.round((end - start) / 1000 / 60);
    }
    
    const endedEvent: WSInterviewEndedEvent = {
      event: 'interview:ended',
      data: {
        reason,
        duration: { totalMinutes }
      }
    };
    connectionManager.send(sessionId, endedEvent);
    
    // Determine which uploads to wait for
    const sessionData = await getSessionWithConfig(sessionId);
    const videoExpected = sessionData?.config?.settings?.cameraMonitoring ?? false;
    const audioExpected = config.audioRecordingEnabled;

    // Register coordinator - callback will fire when all uploads are done
    registerPendingCallback(sessionId, { audioExpected, videoExpected });

    // Start audio finalization (coordinator will be notified on completion)
    finalizeRecording(sessionId).catch(error => {
      console.error(`[Handler] Session ${sessionId} - Recording finalize error:`, error);
    });
    
    systemPromptCache.delete(sessionId);
    cleanupSessionState(sessionId);
    
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - Error ending assessment:`, error);
    sendError(ws, 'INTERNAL_ERROR', 'Değerlendirme sonlandırılırken hata oluştu');
  }
}

function handleCandidateSpeakingStart(sessionId: string): void {
  const state = getSessionState(sessionId);
  if (!state) return;
  updateState(sessionId, 'CANDIDATE_SPEAKING');
}

async function handleCandidateInterrupt(sessionId: string, ws: WebSocket): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) return;
  
  if (state.state !== 'AI_SPEAKING') {
    return;
  }
  
  try {
    cancelTTS(sessionId);
    
    const aiEndEvent: WSAiSpeakingEndEvent = { event: 'ai:speaking:end', data: {} };
    connectionManager.send(sessionId, aiEndEvent);
    
    const systemPrompt = systemPromptCache.get(sessionId);
    if (!systemPrompt) return;
    
    const response = await getInterruptResponse(systemPrompt);
    
    try {
      await streamTTS(sessionId, response);
    } catch (error) {
      console.error(`[Handler] Session ${sessionId} - TTS error for interrupt:`, error);
    }
    
    const aiStartEvent: WSAiSpeakingStartEvent = {
      event: 'ai:speaking:start',
      data: {
        text: response,
        phase: state.phase,
        questionId: null,
        turn: 'candidate'
      }
    };
    connectionManager.send(sessionId, aiStartEvent);
    connectionManager.send(sessionId, { event: 'ai:speaking:end', data: {} });
    
    updateState(sessionId, 'WAITING_FOR_CANDIDATE');
    
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - Error handling interrupt:`, error);
  }
}

async function handleTranscriptUpdate(sessionId: string, ws: WebSocket, event: WSTranscriptUpdateEvent): Promise<void> {
  const { text, isFinal } = event.data;

  if (!isFinal) return;
  
  const state = getSessionState(sessionId);
  if (!state) return;
  
  try {
    updateState(sessionId, 'PROCESSING');

    // --- STT Validation (gpt-5.4-nano) ---
    const sessionData = await getSessionWithConfig(sessionId);
    if (!sessionData) {
      sendError(ws, 'SESSION_NOT_FOUND', 'Session bulunamadı', false);
      return;
    }

    const retryCount = getSttRetryCount(sessionId);
    
    if (retryCount < STT_MAX_RETRIES) {
      const validation = await validateTranscript(text, {
        lastAIMessage: state.lastAIMessage,
        currentPhase: state.phase,
        assessmentTitle: sessionData.config.assessmentData.title,
      });

      if (!validation.valid) {
        console.log(`[Handler] Session ${sessionId} - STT invalid (retry ${retryCount + 1}/${STT_MAX_RETRIES}): "${text.substring(0, 60)}"`);
        incrementSttRetry(sessionId);

        const rejectedEvent: WSTranscriptRejectedEvent = {
          event: 'transcript:rejected',
          data: { phase: state.phase },
        };
        connectionManager.send(sessionId, rejectedEvent);

        const retryText = validation.retryMessage || 'Kusura bakmayın, sizi tam anlayamadım. Tekrar söyler misiniz?';

        updateState(sessionId, 'AI_SPEAKING');

        try {
          await streamTTS(sessionId, retryText);
        } catch (ttsErr) {
          console.error(`[Handler] Session ${sessionId} - TTS error for STT retry:`, ttsErr);
        }

        const retryEvent: WSAiSpeakingStartEvent = {
          event: 'ai:speaking:start',
          data: {
            text: retryText,
            phase: state.phase,
            questionId: null,
            turn: 'candidate',
          },
        };
        connectionManager.send(sessionId, retryEvent);
        connectionManager.send(sessionId, { event: 'ai:speaking:end', data: {} });
        updateState(sessionId, 'WAITING_FOR_CANDIDATE');
        return;
      }
    }

    // Valid transcript - reset retry counter and notify frontend
    resetSttRetry(sessionId);

    const validatedEvent: WSTranscriptValidatedEvent = {
      event: 'transcript:validated',
      data: { text, phase: state.phase },
    };
    connectionManager.send(sessionId, validatedEvent);

    await saveCandidateMessage(sessionId, text, state.lastAIMessage ? null : undefined);
    addToConversationHistory(sessionId, 'user', text);
    
    const systemPrompt = systemPromptCache.get(sessionId);
    if (!systemPrompt) {
      sendError(ws, 'INTERNAL_ERROR', 'Sistem hatası');
      return;
    }
    
    updateState(sessionId, 'AI_GENERATING');
    
    connectionManager.send(sessionId, { event: 'ai:generating:start', data: {} });
    
    const context = {
      session: sessionData.session,
      config: sessionData.config,
      lastAIMessage: state.lastAIMessage,
      lastCandidateMessage: text,
      elapsedMinutes: getElapsedMinutes(sessionId),
      currentQuestionIndex: getPhaseQuestionCount(sessionId),
    };
    
    const conversationHistory = getConversationHistory(sessionId);
    const action = await getNextAction(context, systemPrompt, conversationHistory, sessionId);
    
    connectionManager.send(sessionId, { event: 'ai:generating:end', data: {} });
    
    await processAssessmentAction(sessionId, ws, action);
    
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - Error processing transcript:`, error);
    connectionManager.send(sessionId, { event: 'ai:generating:end', data: {} });
    const errorMessage = error instanceof Error ? error.message : 'AI yanıt hatası oluştu';
    sendError(ws, 'LLM_ERROR', errorMessage, true);
    updateState(sessionId, 'WAITING_FOR_CANDIDATE');
  }
}

// ============================================
// ACTION PROCESSING
// ============================================

async function processAssessmentAction(sessionId: string, ws: WebSocket, action: AssessmentAction): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) return;
  
  console.log(`[Handler] Session ${sessionId} - Processing action: ${action.action}`);

  // Safety net: if AI returned ask_question/provide_correction but the text
  // contains closing phrases, force end_assessment so the interview terminates.
  if (action.action !== 'end_assessment') {
    const sessionData = await getSessionWithConfig(sessionId);
    if (sessionData) {
      const totalQuestions = sessionData.config.questionsData.length;
      const currentCount = getPhaseQuestionCount(sessionId);
      const textLower = action.text.toLowerCase();
      const hasClosingSignals = textLower.includes('teşekkür') || textLower.includes('görüşmek üzere') || textLower.includes('bu ekrandan ayrılmayın');

      // Force end if: question count exceeds total (all answered) OR text has closing phrases
      if (currentCount >= totalQuestions + 1 || (currentCount >= totalQuestions && hasClosingSignals)) {
        console.warn(`[Handler] Session ${sessionId} - Forcing end_assessment (count=${currentCount}/${totalQuestions}, closingSignals=${hasClosingSignals}, originalAction=${action.action})`);
        action.action = 'end_assessment';
      }
    }
  }
  
  switch (action.action) {
    case 'ask_question':
    case 'provide_correction':
      await handleAskOrCorrect(sessionId, ws, action);
      break;
    case 'end_assessment':
      await handleEndAssessment(sessionId, ws, action);
      break;
  }
}

async function handleAskOrCorrect(sessionId: string, ws: WebSocket, action: AssessmentAction): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) return;
  
  updateState(sessionId, 'AI_SPEAKING');
  
  await saveAIMessage(sessionId, action.text, action.questionId);
  incrementPhaseQuestionCount(sessionId);
  
  const jsonResponse = JSON.stringify({
    action: action.action,
    text: action.text,
    questionId: action.questionId,
    isCorrect: action.isCorrect,
    turn: action.turn
  });
  addToConversationHistory(sessionId, 'assistant', jsonResponse);
  
  try {
    await streamTTS(sessionId, action.text);
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - TTS error:`, error);
  }
  
  const aiStartEvent: WSAiSpeakingStartEvent = {
    event: 'ai:speaking:start',
    data: {
      text: action.text,
      phase: state.phase,
      questionId: action.questionId ?? null,
      turn: action.turn
    }
  };
  connectionManager.send(sessionId, aiStartEvent);
  connectionManager.send(sessionId, { event: 'ai:speaking:end', data: {} });
  
  if (action.turn === 'ai') {
    console.log(`[Handler] Session ${sessionId} - Turn is 'ai', continuing automatically`);
    
    try {
      const wordCount = action.text.split(/\s+/).length;
      const estimatedAudioMs = Math.max(1000, wordCount * 150);
      await new Promise(resolve => setTimeout(resolve, estimatedAudioMs));
      
      const sessionData = await getSessionWithConfig(sessionId);
      if (!sessionData) {
        updateState(sessionId, 'WAITING_FOR_CANDIDATE');
        return;
      }
      
      const systemPrompt = systemPromptCache.get(sessionId);
      if (!systemPrompt) {
        updateState(sessionId, 'WAITING_FOR_CANDIDATE');
        return;
      }
      
      const aiGenState = updateState(sessionId, 'AI_GENERATING');
      if (!aiGenState) {
        updateState(sessionId, 'WAITING_FOR_CANDIDATE');
        return;
      }
      
      connectionManager.send(sessionId, { event: 'ai:generating:start', data: {} });
      
      const context = {
        session: sessionData.session,
        config: sessionData.config,
        lastAIMessage: action.text,
        lastCandidateMessage: null,
        elapsedMinutes: getElapsedMinutes(sessionId),
        currentQuestionIndex: getPhaseQuestionCount(sessionId),
      };
      
      const conversationHistory = getConversationHistory(sessionId);
      const nextAction = await getNextAction(context, systemPrompt, conversationHistory, sessionId);
      
      connectionManager.send(sessionId, { event: 'ai:generating:end', data: {} });
      
      if (nextAction.turn === 'ai') {
        console.warn(`[Handler] Session ${sessionId} - AI returned turn:'ai' twice, forcing to 'candidate'`);
        nextAction.turn = 'candidate';
      }
      
      await processAssessmentAction(sessionId, ws, nextAction);
      
    } catch (error) {
      console.error(`[Handler] Session ${sessionId} - Error in turn:'ai' continuation:`, error);
      sendError(ws, 'LLM_ERROR', 'AI yanıt hatası oluştu', true);
      updateState(sessionId, 'WAITING_FOR_CANDIDATE');
      connectionManager.send(sessionId, { event: 'ai:generating:end', data: {} });
    }
  } else {
    updateState(sessionId, 'WAITING_FOR_CANDIDATE');
  }
}

async function handleEndAssessment(sessionId: string, ws: WebSocket, action: AssessmentAction): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) return;
  
  if (action.text) {
    updateState(sessionId, 'AI_SPEAKING');
    await saveAIMessage(sessionId, action.text, null);
    
    try {
      await streamTTS(sessionId, action.text);
    } catch (error) {
      console.error(`[Handler] Session ${sessionId} - TTS error for closing:`, error);
    }
    
    const aiStartEvent: WSAiSpeakingStartEvent = {
      event: 'ai:speaking:start',
      data: {
        text: action.text,
        phase: 'closing',
        questionId: null,
        turn: 'candidate'
      }
    };
    connectionManager.send(sessionId, aiStartEvent);
    connectionManager.send(sessionId, { event: 'ai:speaking:end', data: {} });
  }
  
  const session = await endInterview(sessionId, 'completed');
  if (!session) {
    sendError(ws, 'INTERNAL_ERROR', 'Değerlendirme sonlandırılamadı');
    return;
  }
  
  let totalMinutes = 0;
  if (session.startedAt && session.endedAt) {
    const start = new Date(session.startedAt).getTime();
    const end = new Date(session.endedAt).getTime();
    totalMinutes = Math.round((end - start) / 1000 / 60);
  }
  
  const endedEvent: WSInterviewEndedEvent = {
    event: 'interview:ended',
    data: {
      reason: 'completed',
      duration: { totalMinutes }
    }
  };
  connectionManager.send(sessionId, endedEvent);
  
  // Determine which uploads to wait for
  const endSessionData = await getSessionWithConfig(sessionId);
  const endVideoExpected = endSessionData?.config?.settings?.cameraMonitoring ?? false;
  const endAudioExpected = config.audioRecordingEnabled;

  // Register coordinator - callback will fire when all uploads are done
  registerPendingCallback(sessionId, { audioExpected: endAudioExpected, videoExpected: endVideoExpected });

  // Start audio finalization (coordinator will be notified on completion)
  finalizeRecording(sessionId).catch(error => {
    console.error(`[Handler] Session ${sessionId} - Recording finalize error:`, error);
  });
  
  systemPromptCache.delete(sessionId);
  cleanupSessionState(sessionId);
}

// ============================================
// INITIALIZATION & RECONNECT
// ============================================

export async function initializeSession(sessionId: string): Promise<{ success: boolean; isReconnect: boolean }> {
  const sessionData = await getSessionWithConfig(sessionId);
  if (!sessionData) {
    return { success: false, isReconnect: false };
  }
  
  const { session, config: assessmentConfig } = sessionData;
  
  if (session.status === 'active') {
    const existingState = await loadStateFromDb(sessionId);
    if (existingState) {
      console.log(`[Handler] Session ${sessionId} - Reconnected to active session`);
      const systemPrompt = buildSystemPrompt(assessmentConfig);
      systemPromptCache.set(sessionId, systemPrompt);
      return { success: true, isReconnect: true };
    }
  }
  
  initializeSessionState(sessionId, session);
  return { success: true, isReconnect: false };
}

export function handleSessionDisconnect(sessionId: string, closeCode: number): void {
  systemPromptCache.delete(sessionId);
  messageCounters.delete(sessionId);
  sttRetryCounters.delete(sessionId);

  const state = getSessionState(sessionId);
  cleanupSessionState(sessionId);
  
  if (state && state.state === 'COMPLETED') {
    console.log(`[Handler] Session ${sessionId} - Completed session, full cleanup done`);
  } else if (closeCode === 4010) {
    console.log(`[Handler] Session ${sessionId} - Session takeover, state preserved in DB`);
  } else {
    console.log(`[Handler] Session ${sessionId} - Disconnected (code: ${closeCode}), DB state preserved`);
  }
}

async function handleInterviewResume(sessionId: string, ws: WebSocket): Promise<void> {
  console.log(`[Handler] Session ${sessionId} - Resume requested`);
  
  const state = getSessionState(sessionId);
  if (!state) {
    sendError(ws, 'SESSION_NOT_FOUND', 'Session state bulunamadı', false);
    return;
  }

  try {
    await createSessionEvent({
      sessionId,
      eventType: 'interview_resumed',
      eventData: { previousState: state.state, phase: state.phase },
    });

    const lastEntry = await getLastTranscriptEntry(sessionId);

    if (!lastEntry) {
      await regenerateFirstQuestion(sessionId, ws);
      return;
    }

    if (lastEntry.speaker === 'ai') {
      await resendLastAIMessage(sessionId, ws, lastEntry.content, state);
    } else {
      await generateNewAIResponseForResume(sessionId, ws, state);
    }
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - Error handling resume:`, error);
    sendError(ws, 'INTERNAL_ERROR', 'Değerlendirme devam ettirilemedi', true);
    updateState(sessionId, 'WAITING_FOR_CANDIDATE');
  }
}

async function resendLastAIMessage(
  sessionId: string,
  ws: WebSocket,
  message: string,
  state: ReturnType<typeof getSessionState> & {}
): Promise<void> {
  forceSetState(sessionId, 'AI_SPEAKING');

  try {
    await streamTTS(sessionId, message);
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - TTS error on resume:`, error);
  }

  const aiStartEvent: WSAiSpeakingStartEvent = {
    event: 'ai:speaking:start',
    data: {
      text: message,
      phase: state.phase,
      questionId: null,
      turn: 'candidate',
    }
  };
  connectionManager.send(sessionId, aiStartEvent);
  connectionManager.send(sessionId, { event: 'ai:speaking:end', data: {} });
  forceSetState(sessionId, 'WAITING_FOR_CANDIDATE');
}

async function regenerateFirstQuestion(sessionId: string, ws: WebSocket): Promise<void> {
  const sessionData = await getSessionWithConfig(sessionId);
  if (!sessionData) {
    sendError(ws, 'SESSION_NOT_FOUND', 'Session bulunamadı', false);
    return;
  }

  const { session, config: assessmentConfig } = sessionData;
  const systemPrompt = buildSystemPrompt(assessmentConfig);
  systemPromptCache.set(sessionId, systemPrompt);

  forceSetState(sessionId, 'AI_GENERATING');
  connectionManager.send(sessionId, { event: 'ai:generating:start', data: {} });

  const action = await getFirstQuestion(session, assessmentConfig, systemPrompt, sessionId);

  connectionManager.send(sessionId, { event: 'ai:generating:end', data: {} });
  await processAssessmentAction(sessionId, ws, action);
}

async function generateNewAIResponseForResume(
  sessionId: string,
  ws: WebSocket,
  state: ReturnType<typeof getSessionState> & {}
): Promise<void> {
  const sessionData = await getSessionWithConfig(sessionId);
  if (!sessionData) {
    sendError(ws, 'SESSION_NOT_FOUND', 'Session bulunamadı', false);
    return;
  }

  let systemPrompt = systemPromptCache.get(sessionId);
  if (!systemPrompt) {
    systemPrompt = buildSystemPrompt(sessionData.config);
    systemPromptCache.set(sessionId, systemPrompt);
  }

  forceSetState(sessionId, 'AI_GENERATING');
  connectionManager.send(sessionId, { event: 'ai:generating:start', data: {} });

  const context = {
    session: sessionData.session,
    config: sessionData.config,
    lastAIMessage: state.lastAIMessage,
    lastCandidateMessage: null,
    elapsedMinutes: getElapsedMinutes(sessionId),
    currentQuestionIndex: getPhaseQuestionCount(sessionId),
  };

  const conversationHistory = getConversationHistory(sessionId);
  const action = await getNextAction(context, systemPrompt, conversationHistory, sessionId);

  connectionManager.send(sessionId, { event: 'ai:generating:end', data: {} });
  await processAssessmentAction(sessionId, ws, action);
}

// ============================================
// CAMERA INTEGRITY HANDLER
// ============================================

const CAMERA_EVENT_TYPE_MAP: Record<CameraIntegrityType, string> = {
  face_lost: 'camera_face_lost',
  face_restored: 'camera_face_restored',
  gaze_away: 'camera_gaze_away',
  gaze_restored: 'camera_gaze_restored',
  multi_face: 'camera_multi_face',
  multi_face_restored: 'camera_multi_face_restored',
};

async function handleCameraIntegrity(sessionId: string, event: WSCameraIntegrityEvent): Promise<void> {
  const { type, timestamp, interviewSecond } = event.data;
  const eventType = CAMERA_EVENT_TYPE_MAP[type];

  await createSessionEvent({
    sessionId,
    eventType,
    eventData: { type, timestamp, interviewSecond: interviewSecond ?? null },
  });
}
