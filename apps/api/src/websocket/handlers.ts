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
  InterviewPhase,
  CameraIntegrityType,
} from '@ai-interview/shared';
import { getSessionWithConfig, createSessionEvent } from '../services/sessionService.js';
import { buildSystemPrompt } from '../services/promptBuilder.js';
import {
  getFirstQuestion,
  getNextAction,
  getInterruptResponse,
  type InterviewAction,
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
  notifyInterviewStarted,
  notifyInterviewCompleted,
  notifyInterviewError,
} from '../services/matchmindService.js';
import {
  initRecording,
  finalizeRecording,
} from '../services/audioRecordingService.js';

// ============================================
// WEBSOCKET EVENT HANDLERS
// ============================================

// Valid client event names
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

// Cache for system prompts per session
const systemPromptCache = new Map<string, string>();

// ============================================
// WEBSOCKET MESSAGE RATE LIMITING
// ============================================

const WS_MESSAGE_LIMIT = 60; // per minute per session
const WS_MESSAGE_WINDOW_MS = 60 * 1000;
const messageCounters = new Map<string, { count: number; resetAt: number }>();

// Periyodik temizlik (her 5 dakikada expired entry'leri temizle)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of messageCounters.entries()) {
    if (now > data.resetAt) {
      messageCounters.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

/**
 * Session bazlı WebSocket mesaj rate limiting kontrolü
 * @returns true = izin ver, false = limit aşıldı
 */
function checkMessageRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const entry = messageCounters.get(sessionId);

  if (!entry || now > entry.resetAt) {
    // Yeni pencere başlat
    messageCounters.set(sessionId, { count: 1, resetAt: now + WS_MESSAGE_WINDOW_MS });
    return true;
  }

  entry.count++;
  if (entry.count > WS_MESSAGE_LIMIT) {
    return false; // Limit aşıldı
  }

  return true;
}

/**
 * Validate incoming WebSocket message
 */
export function validateMessage(data: unknown): { valid: true; message: WSClientEvent } | { valid: false; error: string } {
  // Check if data is an object
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Message must be a JSON object' };
  }

  const message = data as Record<string, unknown>;
  const eventName = message['event'];
  const eventData = message['data'];

  // Check event field
  if (!eventName || typeof eventName !== 'string') {
    return { valid: false, error: 'Missing or invalid event field' };
  }

  // Check if event is valid
  if (!VALID_EVENTS.includes(eventName as ValidEventName)) {
    return { valid: false, error: `Unknown event: ${eventName}` };
  }

  // Check data field
  if (eventData === undefined) {
    return { valid: false, error: 'Missing data field' };
  }

  // Validate specific events
  switch (eventName as ValidEventName) {
    case 'interview:end':
      return validateInterviewEndEvent(eventName, eventData);
    case 'transcript:update':
      return validateTranscriptUpdateEvent(eventName, eventData);
    case 'camera:integrity':
      return validateCameraIntegrityEvent(eventName, eventData);
    default:
      // interview:start, candidate:speaking:start/end, candidate:interrupt
      // These events have empty data objects
      return { 
        valid: true, 
        message: { event: eventName, data: eventData } as unknown as WSClientEvent 
      };
  }
}

/**
 * Validate interview:end event
 */
function validateInterviewEndEvent(eventName: string, eventData: unknown): { valid: true; message: WSInterviewEndEvent } | { valid: false; error: string } {
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
    message: { 
      event: 'interview:end', 
      data: { reason } 
    } as WSInterviewEndEvent 
  };
}

/**
 * Validate transcript:update event
 */
function validateTranscriptUpdateEvent(eventName: string, eventData: unknown): { valid: true; message: WSTranscriptUpdateEvent } | { valid: false; error: string } {
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
    message: { 
      event: 'transcript:update', 
      data: { text, isFinal } 
    } as WSTranscriptUpdateEvent 
  };
}

/**
 * Validate camera:integrity event
 */
function validateCameraIntegrityEvent(eventName: string, eventData: unknown): { valid: true; message: WSCameraIntegrityEvent } | { valid: false; error: string } {
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

/**
 * Handle validated WebSocket message
 */
export async function handleEvent(sessionId: string, ws: WebSocket, event: WSClientEvent): Promise<void> {
  console.log(`[Handler] Session ${sessionId} - Processing event: ${event.event}`);

  // Mesaj rate limiting kontrolü
  if (!checkMessageRateLimit(sessionId)) {
    console.warn(`[Handler] Session ${sessionId} - Message rate limit exceeded`);
    sendError(ws, 'RATE_LIMIT_EXCEEDED', 'Too many messages, please slow down', true);
    return;
  }

  try {
    switch (event.event) {
      case 'interview:start':
        await handleInterviewStart(sessionId, ws, event);
        break;
      case 'interview:end':
        await handleInterviewEnd(sessionId, ws, event);
        break;
      case 'interview:resume':
        await handleInterviewResume(sessionId, ws);
        break;
      case 'candidate:speaking:start':
        handleCandidateSpeakingStart(sessionId, ws, event);
        break;
      case 'candidate:speaking:end':
        handleCandidateSpeakingEnd(sessionId, ws, event);
        break;
      case 'candidate:interrupt':
        await handleCandidateInterrupt(sessionId, ws, event);
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

/**
 * Send error event to client
 */
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

/**
 * Handle interview:start - Get first question from Claude
 */
async function handleInterviewStart(sessionId: string, ws: WebSocket, event: WSInterviewStartEvent): Promise<void> {
  console.log(`[Handler] Session ${sessionId} - Interview start requested`);
  
  try {
    // Get session with config
    const sessionData = await getSessionWithConfig(sessionId);
    if (!sessionData) {
      sendError(ws, 'SESSION_NOT_FOUND', 'Session bulunamadı', false);
      return;
    }
    
    const { session, config: interviewConfig } = sessionData;
    
    // Check if session is already started
    if (session.status !== 'pending') {
      sendError(ws, 'SESSION_ALREADY_STARTED', 'Görüşme zaten başlamış', false);
      return;
    }
    
    // Initialize state machine if not already
    let state = getSessionState(sessionId);
    if (!state) {
      state = initializeSessionState(sessionId, session);
    }
    
    // Start the interview (update DB)
    const startedSession = await startInterview(sessionId);
    if (!startedSession) {
      sendError(ws, 'INTERNAL_ERROR', 'Görüşme başlatılamadı');
      return;
    }
    
    // Notify MatchMind that interview has started (fire-and-forget)
    notifyInterviewStarted(sessionId);
    
    // Recording başlat (fire-and-forget)
    initRecording(sessionId).catch(error => {
      console.error(`[Handler] Session ${sessionId} - Recording init error:`, error);
    });
    
    // Check for test mode (from position title containing "test")
    const isTestMode = interviewConfig.positionData?.title?.toLowerCase().includes('test');
    
    console.log(`[Handler] Session ${sessionId} - Test mode: ${isTestMode}, Position: ${interviewConfig.positionData?.title}`);
    
    // Build and cache system prompt
    const systemPrompt = buildSystemPrompt(interviewConfig, { testMode: isTestMode });
    systemPromptCache.set(sessionId, systemPrompt);
    
    // Send AI generating start event
    const aiGeneratingStartEvent: WSAiGeneratingStartEvent = {
      event: 'ai:generating:start',
      data: {}
    };
    connectionManager.send(sessionId, aiGeneratingStartEvent);
    
    // Get first question from Claude
    const action = await getFirstQuestion(session, interviewConfig, systemPrompt, sessionId);
    
    // Send AI generating end event
    const aiGeneratingEndEvent: WSAiGeneratingEndEvent = {
      event: 'ai:generating:end',
      data: {}
    };
    connectionManager.send(sessionId, aiGeneratingEndEvent);
    
    // Process the action
    await processInterviewAction(sessionId, ws, action);
    
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - Error starting interview:`, error);
    
    // Send AI generating end event (in case we sent start but error occurred)
    connectionManager.send(sessionId, { event: 'ai:generating:end', data: {} });
    
    // Send error with more detail
    const errorMessage = error instanceof Error ? error.message : 'AI yanıt hatası oluştu';
    sendError(ws, 'LLM_ERROR', errorMessage, true);
    
    // Recovery: Set state to waiting for candidate
    updateState(sessionId, 'WAITING_FOR_CANDIDATE');
  }
}

/**
 * Handle interview:end - End the interview
 */
async function handleInterviewEnd(sessionId: string, ws: WebSocket, event: WSInterviewEndEvent): Promise<void> {
  console.log(`[Handler] Session ${sessionId} - Interview end requested (reason: ${event.data.reason})`);

  try {
    const reason = event.data.reason;
    
    // End the interview
    const session = await endInterview(sessionId, reason);
    if (!session) {
      sendError(ws, 'INTERNAL_ERROR', 'Görüşme sonlandırılamadı');
      return;
    }
    
    // Calculate duration
    let totalMinutes = 0;
    if (session.startedAt && session.endedAt) {
      const start = new Date(session.startedAt).getTime();
      const end = new Date(session.endedAt).getTime();
      totalMinutes = Math.round((end - start) / 1000 / 60);
    }
    
    // Send interview:ended event
    const endedEvent: WSInterviewEndedEvent = {
      event: 'interview:ended',
      data: {
        reason,
        duration: { totalMinutes }
      }
    };
    connectionManager.send(sessionId, endedEvent);
    
    // Notify MatchMind about interview completion (fire-and-forget)
    if (reason === 'completed' || reason === 'candidate_left') {
      // Calculate duration in seconds for MatchMind
      let durationSeconds = 0;
      if (session.startedAt && session.endedAt) {
        const start = new Date(session.startedAt).getTime();
        const end = new Date(session.endedAt).getTime();
        durationSeconds = Math.round((end - start) / 1000);
      }
      notifyInterviewCompleted(sessionId, durationSeconds);
    } else if (reason === 'technical_error') {
      notifyInterviewError(sessionId);
    }
    
    // Recording finalize (fire-and-forget, async)
    finalizeRecording(sessionId).catch(error => {
      console.error(`[Handler] Session ${sessionId} - Recording finalize error:`, error);
    });
    
    // Cleanup
    systemPromptCache.delete(sessionId);
    cleanupSessionState(sessionId);
    
    console.log(`[Handler] Session ${sessionId} - Interview ended successfully`);
    
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - Error ending interview:`, error);
    sendError(ws, 'INTERNAL_ERROR', 'Görüşme sonlandırılırken hata oluştu');
  }
}

/**
 * Handle candidate:speaking:start
 */
function handleCandidateSpeakingStart(sessionId: string, ws: WebSocket, event: WSCandidateSpeakingStartEvent): void {
  console.log(`[Handler] Session ${sessionId} - Candidate started speaking`);

  const state = getSessionState(sessionId);
  if (!state) {
    console.error(`[Handler] Session ${sessionId} - No state found`);
    return;
  }
  
  // Update state to CANDIDATE_SPEAKING
  updateState(sessionId, 'CANDIDATE_SPEAKING');
}

/**
 * Handle candidate:speaking:end
 */
function handleCandidateSpeakingEnd(sessionId: string, ws: WebSocket, event: WSCandidateSpeakingEndEvent): void {
  console.log(`[Handler] Session ${sessionId} - Candidate stopped speaking`);

  const state = getSessionState(sessionId);
  if (!state) {
    console.error(`[Handler] Session ${sessionId} - No state found`);
    return;
  }
  
  // State will be updated when transcript:update with isFinal=true arrives
  // For now, just log it
}

/**
 * Handle candidate:interrupt - Stop AI and acknowledge
 */
async function handleCandidateInterrupt(sessionId: string, ws: WebSocket, event: WSCandidateInterruptEvent): Promise<void> {
  console.log(`[Handler] Session ${sessionId} - Candidate interrupt requested`);

  const state = getSessionState(sessionId);
  if (!state) {
    console.error(`[Handler] Session ${sessionId} - No state found`);
    return;
  }
  
  // Only handle interrupt if AI is speaking
  if (state.state !== 'AI_SPEAKING') {
    console.log(`[Handler] Session ${sessionId} - Ignoring interrupt, AI not speaking (state: ${state.state})`);
    return;
  }
  
  try {
    // Cancel any active TTS stream
    cancelTTS(sessionId);
    
    // Send ai:speaking:end event (to stop any playback)
    const aiEndEvent: WSAiSpeakingEndEvent = {
      event: 'ai:speaking:end',
      data: {}
    };
    connectionManager.send(sessionId, aiEndEvent);
    
    // Get system prompt
    const systemPrompt = systemPromptCache.get(sessionId);
    if (!systemPrompt) {
      console.error(`[Handler] Session ${sessionId} - No system prompt cached`);
      return;
    }
    
    // Get interrupt response from Claude
    const response = await getInterruptResponse(systemPrompt);
    
    // Generate TTS FIRST (before sending text)
    try {
      await streamTTS(sessionId, response);
    } catch (error) {
      console.error(`[Handler] Session ${sessionId} - TTS error for interrupt response:`, error);
    }
    
    // NOW send the acknowledgment text (after TTS ready)
    const aiStartEvent: WSAiSpeakingStartEvent = {
      event: 'ai:speaking:start',
      data: {
        text: response,
        phase: state.phase,
        topic: null,
        reasoning: null, // Interrupt response has no reasoning
        turn: 'candidate' // Aday kesti, şimdi sıra adayda
      }
    };
    connectionManager.send(sessionId, aiStartEvent);
    
    // Send ai:speaking:end immediately (audio already sent)
    connectionManager.send(sessionId, { event: 'ai:speaking:end', data: {} });
    
    // Update state to WAITING_FOR_CANDIDATE
    updateState(sessionId, 'WAITING_FOR_CANDIDATE');
    
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - Error handling interrupt:`, error);
  }
}

/**
 * Handle transcript:update - Process final transcript
 */
async function handleTranscriptUpdate(sessionId: string, ws: WebSocket, event: WSTranscriptUpdateEvent): Promise<void> {
  const { text, isFinal } = event.data;
  console.log(`[Handler] Session ${sessionId} - Transcript update (isFinal: ${isFinal}): ${text.substring(0, 50)}...`);

  // Only process final transcripts
  if (!isFinal) {
    // Partial transcript - just log for now
    // In Phase 5, we might want to show real-time transcription
    return;
  }
  
  const state = getSessionState(sessionId);
  if (!state) {
    console.error(`[Handler] Session ${sessionId} - No state found`);
    return;
  }
  
  try {
    // Update state to PROCESSING
    updateState(sessionId, 'PROCESSING');
    
    // Save candidate message to transcript
    await saveCandidateMessage(sessionId, text, state.lastAIMessage ? null : undefined);
    
    // Add to conversation history
    addToConversationHistory(sessionId, 'user', text);
    
    // Get system prompt
    const systemPrompt = systemPromptCache.get(sessionId);
    if (!systemPrompt) {
      console.error(`[Handler] Session ${sessionId} - No system prompt cached`);
      sendError(ws, 'INTERNAL_ERROR', 'Sistem hatası');
      return;
    }
    
    // Get session data for context
    const sessionData = await getSessionWithConfig(sessionId);
    if (!sessionData) {
      sendError(ws, 'SESSION_NOT_FOUND', 'Session bulunamadı', false);
      return;
    }
    
    // Update state to AI_GENERATING
    updateState(sessionId, 'AI_GENERATING');
    
    // Send AI generating start event
    const aiGeneratingStartEvent: WSAiGeneratingStartEvent = {
      event: 'ai:generating:start',
      data: {}
    };
    connectionManager.send(sessionId, aiGeneratingStartEvent);
    
    // Build conversation context
    const context = {
      session: sessionData.session,
      config: sessionData.config,
      lastAIMessage: state.lastAIMessage,
      lastCandidateMessage: text,
      elapsedMinutes: getElapsedMinutes(sessionId),
      phaseQuestionCount: getPhaseQuestionCount(sessionId),
    };
    
    // Get next action from Claude
    const conversationHistory = getConversationHistory(sessionId);
    const action = await getNextAction(context, systemPrompt, conversationHistory, sessionId);
    
    // Send AI generating end event
    const aiGeneratingEndEvent: WSAiGeneratingEndEvent = {
      event: 'ai:generating:end',
      data: {}
    };
    connectionManager.send(sessionId, aiGeneratingEndEvent);
    
    // Process the action
    await processInterviewAction(sessionId, ws, action);
    
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - Error processing transcript:`, error);
    
    // Send AI generating end event (in case we sent start but error occurred)
    connectionManager.send(sessionId, { event: 'ai:generating:end', data: {} });
    
    // Send error to client with more detail
    const errorMessage = error instanceof Error ? error.message : 'AI yanıt hatası oluştu';
    sendError(ws, 'LLM_ERROR', errorMessage, true);
    
    // Recovery: Set state to waiting for candidate so interview can continue
    updateState(sessionId, 'WAITING_FOR_CANDIDATE');
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Process interview action from Claude
 */
async function processInterviewAction(sessionId: string, ws: WebSocket, action: InterviewAction): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) {
    console.error(`[Handler] Session ${sessionId} - No state found`);
    return;
  }
  
  console.log(`[Handler] Session ${sessionId} - Processing action: ${action.action}`);
  
  switch (action.action) {
    case 'ask_question':
      await handleAskQuestion(sessionId, ws, action);
      break;
      
    case 'change_phase':
      await handleChangePhase(sessionId, ws, action);
      break;
      
    case 'end_interview':
      await handleEndInterview(sessionId, ws, action);
      break;
  }
}

/**
 * Handle ask_question action
 */
async function handleAskQuestion(sessionId: string, ws: WebSocket, action: InterviewAction): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) return;
  
  // Update state to AI_SPEAKING
  updateState(sessionId, 'AI_SPEAKING');
  
  // Save AI message to transcript (DB only, not sent to frontend yet)
  await saveAIMessage(sessionId, action.question, action.topic);
  
  // Increment question count for current phase
  incrementPhaseQuestionCount(sessionId);
  
  // Add to conversation history (as JSON for Claude context)
  const jsonResponse = JSON.stringify({
    action: action.action,
    question: action.question,
    topic: action.topic,
    isFollowUp: action.isFollowUp,
    note: action.note,
    turn: action.turn
  });
  addToConversationHistory(sessionId, 'assistant', jsonResponse);
  
  // Generate TTS audio FIRST (before sending text to frontend)
  // This ensures text appears when avatar starts speaking
  try {
    await streamTTS(sessionId, action.question);
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - TTS error:`, error);
  }
  
  // NOW send ai:speaking:start with text (after TTS is ready)
  // Frontend will receive text and audio data almost simultaneously
  // turn field tells frontend whether to activate microphone
  const aiStartEvent: WSAiSpeakingStartEvent = {
    event: 'ai:speaking:start',
    data: {
      text: action.question,
      phase: state.phase,
      topic: action.topic ?? null,
      reasoning: action.reasoning ?? null,
      turn: action.turn // 'candidate' = mikrofon açılsın, 'ai' = AI devam edecek
    }
  };
  connectionManager.send(sessionId, aiStartEvent);
  
  // Send ai:speaking:end immediately after (audio is already sent)
  const aiEndEvent: WSAiSpeakingEndEvent = {
    event: 'ai:speaking:end',
    data: {}
  };
  connectionManager.send(sessionId, aiEndEvent);
  
  // If turn is 'ai', we need to continue speaking (get next action)
  // If turn is 'candidate', wait for candidate response
  if (action.turn === 'ai') {
    console.log(`[Handler] Session ${sessionId} - Turn is 'ai', getting next action automatically`);
    
    try {
      // Wait for estimated audio duration before continuing
      const wordCount = action.question.split(/\s+/).length;
      const estimatedAudioMs = Math.max(1000, wordCount * 150); // At least 1 second
      await new Promise(resolve => setTimeout(resolve, estimatedAudioMs));
      
      // Get session data for context
      const sessionData = await getSessionWithConfig(sessionId);
      if (!sessionData) {
        console.error(`[Handler] Session ${sessionId} - Session not found for continuation`);
        updateState(sessionId, 'WAITING_FOR_CANDIDATE');
        return;
      }
      
      // Get system prompt
      const systemPrompt = systemPromptCache.get(sessionId);
      if (!systemPrompt) {
        console.error(`[Handler] Session ${sessionId} - No system prompt for continuation`);
        updateState(sessionId, 'WAITING_FOR_CANDIDATE');
        return;
      }
      
      // Update state to AI_GENERATING (with return check for safety)
      const aiGenState = updateState(sessionId, 'AI_GENERATING');
      if (!aiGenState) {
        console.error(`[Handler] Session ${sessionId} - Failed transition to AI_GENERATING, recovering`);
        updateState(sessionId, 'WAITING_FOR_CANDIDATE');
        return;
      }
      
      // Send AI generating start event
      connectionManager.send(sessionId, { event: 'ai:generating:start', data: {} });
      
      // Build context for continuation (no new candidate message)
      const context = {
        session: sessionData.session,
        config: sessionData.config,
        lastAIMessage: action.question,
        lastCandidateMessage: null, // AI is continuing, no candidate response
        elapsedMinutes: getElapsedMinutes(sessionId),
        phaseQuestionCount: getPhaseQuestionCount(sessionId),
      };
      
      // Get next action
      const conversationHistory = getConversationHistory(sessionId);
      const nextAction = await getNextAction(context, systemPrompt, conversationHistory, sessionId);
      
      // Send AI generating end event
      connectionManager.send(sessionId, { event: 'ai:generating:end', data: {} });
      
      // Safety check: Force turn to 'candidate' if we got another 'ai' turn
      // This prevents infinite loops
      if (nextAction.turn === 'ai') {
        console.warn(`[Handler] Session ${sessionId} - AI returned turn:'ai' twice, forcing to 'candidate'`);
        nextAction.turn = 'candidate';
      }
      
      // Process next action
      await processInterviewAction(sessionId, ws, nextAction);
      
    } catch (error) {
      console.error(`[Handler] Session ${sessionId} - Error in turn:'ai' continuation:`, error);
      
      // Send error to client
      sendError(ws, 'LLM_ERROR', 'AI yanıt hatası oluştu', true);
      
      // Recovery: Set state to waiting for candidate so interview can continue
      updateState(sessionId, 'WAITING_FOR_CANDIDATE');
      
      // Send AI generating end event (in case we sent start but not end)
      connectionManager.send(sessionId, { event: 'ai:generating:end', data: {} });
    }
  } else {
    // turn is 'candidate' - wait for candidate response
    updateState(sessionId, 'WAITING_FOR_CANDIDATE');
  }
}

/**
 * Handle change_phase action
 */
async function handleChangePhase(sessionId: string, ws: WebSocket, action: InterviewAction): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) return;
  
  const oldPhase = state.phase;
  const newPhase = action.nextPhase as InterviewPhase;
  
  // Change phase in DB
  await changePhase(sessionId, newPhase);
  
  // Send phase:changed event
  const phaseChangedEvent: WSPhaseChangedEvent = {
    event: 'phase:changed',
    data: {
      from: oldPhase,
      to: newPhase,
      questionIndex: 0
    }
  };
  connectionManager.send(sessionId, phaseChangedEvent);
  
  // If there's a question with the phase change, ask it
  if (action.question) {
    await handleAskQuestion(sessionId, ws, action);
  } else {
    // Update state to WAITING_FOR_CANDIDATE
    updateState(sessionId, 'WAITING_FOR_CANDIDATE');
  }
}

/**
 * Handle end_interview action (from Claude)
 */
async function handleEndInterview(sessionId: string, ws: WebSocket, action: InterviewAction): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) return;
  
  // If there's a closing message, send it first
  if (action.question) {
    // Update state to AI_SPEAKING
    updateState(sessionId, 'AI_SPEAKING');
    
    // Save AI message
    await saveAIMessage(sessionId, action.question, null);
    
    // Generate TTS FIRST (before sending text)
    try {
      await streamTTS(sessionId, action.question);
    } catch (error) {
      console.error(`[Handler] Session ${sessionId} - TTS error for closing message:`, error);
    }
    
    // NOW send ai:speaking:start with closing message (after TTS ready)
    const aiStartEvent: WSAiSpeakingStartEvent = {
      event: 'ai:speaking:start',
      data: {
        text: action.question,
        phase: state.phase,
        topic: null,
        reasoning: action.reasoning ?? null,
        turn: 'candidate' // Kapanış mesajı, görüşme bitiyor - turn önemsiz ama type uyumluluğu için
      }
    };
    connectionManager.send(sessionId, aiStartEvent);
    
    // Send ai:speaking:end immediately (audio already sent)
    connectionManager.send(sessionId, { event: 'ai:speaking:end', data: {} });
    
    // Wait for audio to finish playing on frontend before ending
    // PCM16 @ 16kHz = 32000 bytes/sec, estimate from TTS response
    const wordCount = action.question.split(/\s+/).length;
    const estimatedAudioMs = Math.max(2000, wordCount * 150); // At least 2 seconds
    console.log(`[Handler] Session ${sessionId} - Waiting ${estimatedAudioMs}ms for closing message audio`);
    await new Promise(resolve => setTimeout(resolve, estimatedAudioMs));
  }
  
  // End the interview
  const session = await endInterview(sessionId, 'completed');
  if (!session) {
    sendError(ws, 'INTERNAL_ERROR', 'Görüşme sonlandırılamadı');
    return;
  }
  
  // Calculate duration
  let totalMinutes = 0;
  if (session.startedAt && session.endedAt) {
    const start = new Date(session.startedAt).getTime();
    const end = new Date(session.endedAt).getTime();
    totalMinutes = Math.round((end - start) / 1000 / 60);
  }
  
  // Send interview:ended event
  const endedEvent: WSInterviewEndedEvent = {
    event: 'interview:ended',
    data: {
      reason: 'completed',
      duration: { totalMinutes }
    }
  };
  connectionManager.send(sessionId, endedEvent);
  
  // Notify MatchMind about interview completion (fire-and-forget)
  // Calculate duration in seconds for MatchMind
  let durationSeconds = 0;
  if (session.startedAt && session.endedAt) {
    const start = new Date(session.startedAt).getTime();
    const end = new Date(session.endedAt).getTime();
    durationSeconds = Math.round((end - start) / 1000);
  }
  notifyInterviewCompleted(sessionId, durationSeconds);
  
  // Recording finalize (fire-and-forget, async)
  finalizeRecording(sessionId).catch(error => {
    console.error(`[Handler] Session ${sessionId} - Recording finalize error (auto-end):`, error);
  });
  
  // Cleanup
  systemPromptCache.delete(sessionId);
  cleanupSessionState(sessionId);
  
  console.log(`[Handler] Session ${sessionId} - Interview ended by AI`);
}

// ============================================
// INITIALIZATION HELPER
// ============================================

/**
 * Initialize session state when WS connects
 * Called from websocket/index.ts after connection:ready
 * Supports reconnection for active sessions
 */
export async function initializeSession(sessionId: string): Promise<{ success: boolean; isReconnect: boolean }> {
  const sessionData = await getSessionWithConfig(sessionId);
  if (!sessionData) {
    return { success: false, isReconnect: false };
  }
  
  const { session, config: interviewConfig } = sessionData;
  
  // Check if this is a reconnection (session is active)
  if (session.status === 'active') {
    // Try to load existing state from DB
    const existingState = await loadStateFromDb(sessionId);
    if (existingState) {
      console.log(`[Handler] Session ${sessionId} - Reconnected to active session`);
      
      // IMPORTANT: Rebuild and cache system prompt for reconnected session
      // This is needed because systemPromptCache is lost when server restarts or connection drops
      const isTestMode = interviewConfig.positionData?.title?.toLowerCase().includes('test');
      const systemPrompt = buildSystemPrompt(interviewConfig, { testMode: isTestMode });
      systemPromptCache.set(sessionId, systemPrompt);
      console.log(`[Handler] Session ${sessionId} - System prompt cached for reconnected session`);
      
      return { success: true, isReconnect: true };
    }
  }
  
  // New session or pending session - initialize fresh state
  initializeSessionState(sessionId, session);
  return { success: true, isReconnect: false };
}

/**
 * Handle session disconnect with conditional cleanup
 * Active sessions keep their DB state for reconnect
 * Called from websocket/index.ts on close
 */
export function handleSessionDisconnect(sessionId: string, closeCode: number): void {
  // System prompt cache'i her zaman temizle (reconnect'te rebuild edilir)
  systemPromptCache.delete(sessionId);
  messageCounters.delete(sessionId);

  const state = getSessionState(sessionId);
  
  // In-memory state'i temizle (reconnect'te DB'den yüklenecek)
  cleanupSessionState(sessionId);
  
  if (state && state.state === 'COMPLETED') {
    console.log(`[Handler] Session ${sessionId} - Completed session, full cleanup done`);
  } else if (closeCode === 4010) {
    console.log(`[Handler] Session ${sessionId} - Session takeover, state preserved in DB`);
  } else {
    console.log(`[Handler] Session ${sessionId} - Disconnected (code: ${closeCode}), DB state preserved for reconnect`);
  }
}

// ============================================
// INTERVIEW RESUME HANDLER (Reconnect)
// ============================================

/**
 * Handle interview:resume - Resume interview after reconnect
 * Frontend sends this after both WS and Simli avatar are ready
 */
async function handleInterviewResume(sessionId: string, ws: WebSocket): Promise<void> {
  console.log(`[Handler] Session ${sessionId} - Interview resume requested`);
  
  const state = getSessionState(sessionId);
  if (!state) {
    sendError(ws, 'SESSION_NOT_FOUND', 'Session state bulunamadı', false);
    return;
  }

  try {
    // Log resume event
    await createSessionEvent({
      sessionId,
      eventType: 'interview_resumed',
      eventData: {
        previousState: state.state,
        phase: state.phase,
      },
    });

    // Get last transcript entry to determine action
    const lastEntry = await getLastTranscriptEntry(sessionId);

    if (!lastEntry) {
      // Transcript boş - görüşme başlamış ama mesaj yok (edge case)
      // İlk soruyu tekrar üret
      console.log(`[Handler] Session ${sessionId} - No transcript entries, regenerating first question`);
      await regenerateFirstQuestion(sessionId, ws);
      return;
    }

    if (lastEntry.speaker === 'ai') {
      // Son mesaj AI'dan - tekrar gönder (TTS + avatar)
      console.log(`[Handler] Session ${sessionId} - Last message was AI, resending: "${lastEntry.content.substring(0, 50)}..."`);
      await resendLastAIMessage(sessionId, ws, lastEntry.content, state);
    } else {
      // Son mesaj candidate'den - yeni AI yanıt üret
      console.log(`[Handler] Session ${sessionId} - Last message was candidate, generating new AI response`);
      await generateNewAIResponseForResume(sessionId, ws, state);
    }
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - Error handling resume:`, error);
    sendError(ws, 'INTERNAL_ERROR', 'Görüşme devam ettirilemedi', true);
    
    // Recovery: Set to waiting for candidate
    updateState(sessionId, 'WAITING_FOR_CANDIDATE');
  }
}

/**
 * Resend last AI message after reconnect (TTS + avatar)
 */
async function resendLastAIMessage(
  sessionId: string,
  ws: WebSocket,
  message: string,
  state: ReturnType<typeof getSessionState> & {}
): Promise<void> {
  // Force state to AI_SPEAKING (bypasses normal transition validation)
  forceSetState(sessionId, 'AI_SPEAKING');

  // TTS generate
  try {
    await streamTTS(sessionId, message);
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - TTS error on resume:`, error);
    await createSessionEvent({
      sessionId,
      eventType: 'error_occurred',
      eventData: {
        error: 'TTS error on resume',
        service: 'elevenlabs',
        recoverable: true,
      },
    });
  }

  // ai:speaking:start event
  const aiStartEvent: WSAiSpeakingStartEvent = {
    event: 'ai:speaking:start',
    data: {
      text: message,
      phase: state.phase,
      topic: null,
      reasoning: null,
      turn: 'candidate', // Reconnect sonrası her zaman candidate turn
    }
  };
  connectionManager.send(sessionId, aiStartEvent);

  // ai:speaking:end
  connectionManager.send(sessionId, { event: 'ai:speaking:end', data: {} });

  // WAITING_FOR_CANDIDATE'e geçiş
  forceSetState(sessionId, 'WAITING_FOR_CANDIDATE');
}

/**
 * Regenerate first question for resume (edge case: session active but no transcript)
 */
async function regenerateFirstQuestion(sessionId: string, ws: WebSocket): Promise<void> {
  const sessionData = await getSessionWithConfig(sessionId);
  if (!sessionData) {
    sendError(ws, 'SESSION_NOT_FOUND', 'Session bulunamadı', false);
    return;
  }

  const { session, config: interviewConfig } = sessionData;
  const isTestMode = interviewConfig.positionData?.title?.toLowerCase().includes('test');

  // Build system prompt
  const systemPrompt = buildSystemPrompt(interviewConfig, { testMode: isTestMode });
  systemPromptCache.set(sessionId, systemPrompt);

  // Force state to AI_GENERATING
  forceSetState(sessionId, 'AI_GENERATING');

  // Send generating events
  connectionManager.send(sessionId, { event: 'ai:generating:start', data: {} });

  const action = await getFirstQuestion(session, interviewConfig, systemPrompt, sessionId);

  connectionManager.send(sessionId, { event: 'ai:generating:end', data: {} });

  await processInterviewAction(sessionId, ws, action);
}

/**
 * Generate new AI response for resume (when last message was from candidate)
 */
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

  // System prompt should be cached from initializeSession
  let systemPrompt = systemPromptCache.get(sessionId);
  if (!systemPrompt) {
    const isTestMode = sessionData.config.positionData?.title?.toLowerCase().includes('test');
    systemPrompt = buildSystemPrompt(sessionData.config, { testMode: isTestMode });
    systemPromptCache.set(sessionId, systemPrompt);
  }

  // Force state to AI_GENERATING
  forceSetState(sessionId, 'AI_GENERATING');

  connectionManager.send(sessionId, { event: 'ai:generating:start', data: {} });

  const context = {
    session: sessionData.session,
    config: sessionData.config,
    lastAIMessage: state.lastAIMessage,
    lastCandidateMessage: null,
    elapsedMinutes: getElapsedMinutes(sessionId),
    phaseQuestionCount: getPhaseQuestionCount(sessionId),
  };

  const conversationHistory = getConversationHistory(sessionId);
  const action = await getNextAction(context, systemPrompt, conversationHistory, sessionId);

  connectionManager.send(sessionId, { event: 'ai:generating:end', data: {} });

  await processInterviewAction(sessionId, ws, action);
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

  console.log(`[Handler] Session ${sessionId} - Camera integrity: ${type} (sec: ${interviewSecond ?? '?'})`);

  await createSessionEvent({
    sessionId,
    eventType,
    eventData: { type, timestamp, interviewSecond: interviewSecond ?? null },
  });
}
