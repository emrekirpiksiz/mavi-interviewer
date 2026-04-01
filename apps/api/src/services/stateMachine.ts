import type { InterviewPhase, Session, TranscriptEntry, ConversationMessage } from '@ai-interview/shared';
import {
  updateSessionPhase,
  startSession,
  endSession,
  getSessionById,
  updateSession,
} from './sessionService.js';
import { createTranscriptEntry, getLastSequenceNumber } from '../db/queries/transcripts.js';

// ============================================
// STATE MACHINE - INTERVIEW STATE MANAGEMENT
// ============================================
// Now DB-backed for session persistence and reconnection support

// ---------- Types ----------

export type InterviewState =
  | 'IDLE'              // WS connection pending
  | 'READY'             // WS connected, waiting for interview:start
  | 'AI_GENERATING'     // Claude generating response
  | 'AI_SPEAKING'       // TTS playing (Phase 5)
  | 'WAITING_FOR_CANDIDATE'  // Waiting for candidate response
  | 'CANDIDATE_SPEAKING'     // Candidate is speaking
  | 'PROCESSING'        // Processing candidate response
  | 'COMPLETED';        // Interview ended

export interface SessionState {
  sessionId: string;
  state: InterviewState;
  phase: InterviewPhase;
  questionIndex: number;
  startedAt: Date | null;
  lastAIMessage: string | null;
  phaseQuestionCounts: Record<InterviewPhase, number>;
  conversationHistory: ConversationMessage[];
}

// ---------- State Storage (In-Memory + DB) ----------

// In-memory state for active sessions (fast access)
// Also persisted to DB for reconnection support
const sessionStates = new Map<string, SessionState>();

// ---------- DB Persistence Functions ----------

/**
 * Save session state to database
 * Called after every state change for persistence
 */
async function saveStateToDb(sessionId: string, state: SessionState): Promise<void> {
  try {
    await updateSession(sessionId, {
      interviewState: state.state,
      conversationHistory: state.conversationHistory,
      lastAiMessage: state.lastAIMessage,
      phaseQuestionCounts: state.phaseQuestionCounts,
    });
    console.log(`[StateMachine] State saved to DB for session ${sessionId}`);
  } catch (error) {
    console.error(`[StateMachine] Failed to save state to DB:`, error);
    // Don't throw - in-memory state is still valid
  }
}

/**
 * Load session state from database
 * Used for reconnection scenarios
 */
export async function loadStateFromDb(sessionId: string): Promise<SessionState | null> {
  try {
    const session = await getSessionById(sessionId);
    if (!session) {
      return null;
    }

    // Only load state for active sessions
    if (session.status !== 'active') {
      return null;
    }

    const state: SessionState = {
      sessionId,
      state: (session.interviewState as InterviewState) || 'READY',
      phase: session.currentPhase,
      questionIndex: session.currentQuestionIndex,
      startedAt: session.startedAt ? new Date(session.startedAt) : null,
      lastAIMessage: session.lastAiMessage ?? null,
      phaseQuestionCounts: session.phaseQuestionCounts ?? {
        introduction: 0,
        experience: 0,
        technical: 0,
        behavioral: 0,
        motivation: 0,
        closing: 0,
      },
      conversationHistory: session.conversationHistory ?? [],
    };

    // Store in memory for fast access
    sessionStates.set(sessionId, state);
    console.log(`[StateMachine] State loaded from DB for session ${sessionId}`);
    
    return state;
  } catch (error) {
    console.error(`[StateMachine] Failed to load state from DB:`, error);
    return null;
  }
}

// ---------- State Transitions ----------

const VALID_TRANSITIONS: Record<InterviewState, InterviewState[]> = {
  IDLE: ['READY'],
  READY: ['AI_GENERATING'],
  AI_GENERATING: ['AI_SPEAKING', 'COMPLETED'],
  AI_SPEAKING: ['WAITING_FOR_CANDIDATE', 'AI_GENERATING', 'COMPLETED'],
  WAITING_FOR_CANDIDATE: ['CANDIDATE_SPEAKING', 'PROCESSING', 'AI_GENERATING', 'COMPLETED'],
  CANDIDATE_SPEAKING: ['PROCESSING', 'AI_SPEAKING'],  // + AI_SPEAKING (reconnect resume)
  PROCESSING: ['AI_GENERATING', 'AI_SPEAKING', 'COMPLETED'],  // + AI_SPEAKING (reconnect resume)
  COMPLETED: [],
};

/**
 * Check if a state transition is valid
 */
export function isValidTransition(from: InterviewState, to: InterviewState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------- Session State Management ----------

/**
 * Initialize session state (called when WS connects)
 */
export function initializeSessionState(sessionId: string, session: Session): SessionState {
  const state: SessionState = {
    sessionId,
    state: 'READY',
    phase: session.currentPhase,
    questionIndex: session.currentQuestionIndex,
    startedAt: null,
    lastAIMessage: null,
    phaseQuestionCounts: {
      introduction: 0,
      experience: 0,
      technical: 0,
      behavioral: 0,
      motivation: 0,
      closing: 0,
    },
    conversationHistory: [],
  };
  
  sessionStates.set(sessionId, state);
  console.log(`[StateMachine] Session ${sessionId} initialized in READY state`);
  
  return state;
}

/**
 * Get current session state
 */
export function getSessionState(sessionId: string): SessionState | null {
  return sessionStates.get(sessionId) ?? null;
}

/**
 * Update session state
 * Now also persists to DB for reconnection support
 */
export function updateState(
  sessionId: string,
  newState: InterviewState,
  updates?: Partial<Omit<SessionState, 'sessionId' | 'state'>>
): SessionState | null {
  const current = sessionStates.get(sessionId);
  if (!current) {
    console.error(`[StateMachine] Session ${sessionId} not found`);
    return null;
  }
  
  // Validate transition
  if (!isValidTransition(current.state, newState)) {
    console.error(`[StateMachine] Invalid transition: ${current.state} -> ${newState}`);
    return null;
  }
  
  // Update state
  const updated: SessionState = {
    ...current,
    ...updates,
    state: newState,
  };
  
  sessionStates.set(sessionId, updated);
  console.log(`[StateMachine] Session ${sessionId}: ${current.state} -> ${newState}`);
  
  // Persist to DB asynchronously (don't block the response)
  saveStateToDb(sessionId, updated).catch((err) => {
    console.error(`[StateMachine] DB save failed for ${sessionId}:`, err);
  });
  
  return updated;
}

/**
 * Get elapsed minutes since interview started
 */
export function getElapsedMinutes(sessionId: string): number {
  const state = sessionStates.get(sessionId);
  if (!state?.startedAt) {
    return 0;
  }
  
  const elapsed = Date.now() - state.startedAt.getTime();
  return Math.floor(elapsed / 1000 / 60);
}

/**
 * Get phase question count
 */
export function getPhaseQuestionCount(sessionId: string): number {
  const state = sessionStates.get(sessionId);
  if (!state) {
    return 0;
  }
  return state.phaseQuestionCounts[state.phase] ?? 0;
}

/**
 * Increment phase question count
 * Now also persists to DB
 */
export function incrementPhaseQuestionCount(sessionId: string): void {
  const state = sessionStates.get(sessionId);
  if (state) {
    state.phaseQuestionCounts[state.phase] = (state.phaseQuestionCounts[state.phase] ?? 0) + 1;
    sessionStates.set(sessionId, state);
    
    // Persist to DB asynchronously
    saveStateToDb(sessionId, state).catch((err) => {
      console.error(`[StateMachine] DB save failed for ${sessionId}:`, err);
    });
  }
}

/**
 * Add to conversation history
 * Now also persists to DB
 */
export function addToConversationHistory(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): void {
  const state = sessionStates.get(sessionId);
  if (state) {
    state.conversationHistory.push({ role, content });
    sessionStates.set(sessionId, state);
    
    // Persist to DB asynchronously
    saveStateToDb(sessionId, state).catch((err) => {
      console.error(`[StateMachine] DB save failed for ${sessionId}:`, err);
    });
  }
}

/**
 * Get conversation history
 */
export function getConversationHistory(sessionId: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const state = sessionStates.get(sessionId);
  return state?.conversationHistory ?? [];
}

// ---------- Interview Flow Functions ----------

/**
 * Start the interview
 */
export async function startInterview(sessionId: string): Promise<Session | null> {
  const state = sessionStates.get(sessionId);
  if (!state) {
    console.error(`[StateMachine] Cannot start: Session ${sessionId} not found`);
    return null;
  }
  
  if (state.state !== 'READY') {
    console.error(`[StateMachine] Cannot start: Invalid state ${state.state}`);
    return null;
  }
  
  // Update session in DB
  const session = await startSession(sessionId);
  if (!session) {
    console.error(`[StateMachine] Failed to start session in DB`);
    return null;
  }
  
  // Update state machine
  updateState(sessionId, 'AI_GENERATING', {
    startedAt: new Date(),
  });
  
  return session;
}

/**
 * Change interview phase
 */
export async function changePhase(
  sessionId: string,
  newPhase: InterviewPhase
): Promise<Session | null> {
  const state = sessionStates.get(sessionId);
  if (!state) {
    console.error(`[StateMachine] Cannot change phase: Session ${sessionId} not found`);
    return null;
  }
  
  const oldPhase = state.phase;
  
  // Update session in DB
  const session = await updateSessionPhase(sessionId, newPhase, 0);
  if (!session) {
    console.error(`[StateMachine] Failed to update phase in DB`);
    return null;
  }
  
  // Update state machine
  state.phase = newPhase;
  state.questionIndex = 0;
  sessionStates.set(sessionId, state);
  
  console.log(`[StateMachine] Session ${sessionId}: Phase changed ${oldPhase} -> ${newPhase}`);
  
  return session;
}

/**
 * End the interview
 */
export async function endInterview(
  sessionId: string,
  reason: 'completed' | 'candidate_left' | 'technical_error' = 'completed'
): Promise<Session | null> {
  const state = sessionStates.get(sessionId);
  if (!state) {
    console.error(`[StateMachine] Cannot end: Session ${sessionId} not found`);
    return null;
  }
  
  // Update session in DB
  const session = await endSession(sessionId, reason);
  if (!session) {
    console.error(`[StateMachine] Failed to end session in DB`);
    return null;
  }
  
  // Update state machine
  updateState(sessionId, 'COMPLETED');
  
  return session;
}

// ---------- Transcript Functions ----------

/**
 * Save AI message to transcript
 */
export async function saveAIMessage(
  sessionId: string,
  content: string,
  topic?: string | null
): Promise<TranscriptEntry | null> {
  const state = sessionStates.get(sessionId);
  if (!state) {
    console.error(`[StateMachine] Cannot save AI message: Session ${sessionId} not found`);
    return null;
  }
  
  try {
    const sequenceNumber = await getLastSequenceNumber(sessionId) + 1;
    const timestampMs = state.startedAt ? Date.now() - state.startedAt.getTime() : 0;
    
    const entry = await createTranscriptEntry({
      sessionId,
      sequenceNumber,
      speaker: 'ai',
      content,
      phase: state.phase,
      questionContext: topic,
      timestampMs,
    });
    
    // Update last AI message
    state.lastAIMessage = content;
    sessionStates.set(sessionId, state);
    
    // Persist to DB
    saveStateToDb(sessionId, state).catch((err) => {
      console.error(`[StateMachine] DB save failed for ${sessionId}:`, err);
    });
    
    console.log(`[StateMachine] Saved AI message (seq: ${sequenceNumber})`);
    
    return entry;
  } catch (error) {
    console.error(`[StateMachine] Failed to save AI message:`, error);
    return null;
  }
}

/**
 * Save candidate message to transcript
 */
export async function saveCandidateMessage(
  sessionId: string,
  content: string,
  topic?: string | null
): Promise<TranscriptEntry | null> {
  const state = sessionStates.get(sessionId);
  if (!state) {
    console.error(`[StateMachine] Cannot save candidate message: Session ${sessionId} not found`);
    return null;
  }
  
  try {
    const sequenceNumber = await getLastSequenceNumber(sessionId) + 1;
    const timestampMs = state.startedAt ? Date.now() - state.startedAt.getTime() : 0;
    
    const entry = await createTranscriptEntry({
      sessionId,
      sequenceNumber,
      speaker: 'candidate',
      content,
      phase: state.phase,
      questionContext: topic,
      timestampMs,
    });
    
    console.log(`[StateMachine] Saved candidate message (seq: ${sequenceNumber})`);
    
    return entry;
  } catch (error) {
    console.error(`[StateMachine] Failed to save candidate message:`, error);
    return null;
  }
}

// ---------- Cleanup ----------

/**
 * Clean up session state (called when WS disconnects or session ends)
 */
export function cleanupSessionState(sessionId: string): void {
  sessionStates.delete(sessionId);
  console.log(`[StateMachine] Session ${sessionId} state cleaned up`);
}

/**
 * Check if session has active state
 */
export function hasActiveState(sessionId: string): boolean {
  return sessionStates.has(sessionId);
}

// ---------- Reconnect Helpers ----------

/**
 * Get the appropriate state for reconnect scenario
 * All active states resolve to a state where AI will re-speak
 */
export function getReconnectState(savedState: InterviewState): InterviewState {
  switch (savedState) {
    case 'AI_GENERATING':
    case 'AI_SPEAKING':
    case 'WAITING_FOR_CANDIDATE':
    case 'CANDIDATE_SPEAKING':
    case 'PROCESSING':
      // All active states → AI_SPEAKING (son mesaj tekrar gönderilecek)
      return 'AI_SPEAKING';
    case 'COMPLETED':
      return 'COMPLETED';
    default:
      return 'READY';
  }
}

/**
 * Force set state without transition validation
 * Used only for reconnect scenarios where normal transitions don't apply
 */
export function forceSetState(sessionId: string, newState: InterviewState): SessionState | null {
  const current = sessionStates.get(sessionId);
  if (!current) {
    console.error(`[StateMachine] Session ${sessionId} not found for force state set`);
    return null;
  }
  
  const updated: SessionState = {
    ...current,
    state: newState,
  };
  
  sessionStates.set(sessionId, updated);
  console.log(`[StateMachine] Session ${sessionId}: Force set state to ${newState} (reconnect)`);
  
  // Persist to DB
  saveStateToDb(sessionId, updated).catch((err) => {
    console.error(`[StateMachine] DB save failed for ${sessionId}:`, err);
  });
  
  return updated;
}

// ---------- Debug ----------

/**
 * Get all active sessions (for debugging)
 */
export function getActiveSessions(): string[] {
  return Array.from(sessionStates.keys());
}
