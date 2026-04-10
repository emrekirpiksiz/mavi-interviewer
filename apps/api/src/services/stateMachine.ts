import type { AssessmentPhase, Session, TranscriptEntry, ConversationMessage } from '@ai-interview/shared';
import {
  updateSessionPhase,
  startSession,
  endSession,
  getSessionById,
  updateSession,
} from './sessionService.js';
import { createTranscriptEntry, getLastSequenceNumber } from '../db/queries/transcripts.js';

// ============================================
// STATE MACHINE - ASSESSMENT STATE MANAGEMENT
// ============================================

// ---------- Types ----------

export type InterviewState =
  | 'IDLE'
  | 'READY'
  | 'AI_GENERATING'
  | 'AI_SPEAKING'
  | 'WAITING_FOR_CANDIDATE'
  | 'CANDIDATE_SPEAKING'
  | 'PROCESSING'
  | 'COMPLETED';

export interface SessionState {
  sessionId: string;
  state: InterviewState;
  phase: AssessmentPhase;
  questionIndex: number;
  startedAt: Date | null;
  lastAIMessage: string | null;
  phaseQuestionCounts: Record<AssessmentPhase, number>;
  conversationHistory: ConversationMessage[];
}

// ---------- State Storage ----------

const sessionStates = new Map<string, SessionState>();

// ---------- DB Persistence ----------

async function saveStateToDb(sessionId: string, state: SessionState): Promise<void> {
  try {
    await updateSession(sessionId, {
      interviewState: state.state,
      conversationHistory: state.conversationHistory,
      lastAiMessage: state.lastAIMessage,
      phaseQuestionCounts: state.phaseQuestionCounts,
    });
  } catch (error) {
    console.error(`[StateMachine] Failed to save state to DB:`, error);
  }
}

export async function loadStateFromDb(sessionId: string): Promise<SessionState | null> {
  try {
    const session = await getSessionById(sessionId);
    if (!session || session.status !== 'active') {
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
        assessment: 0,
        closing: 0,
      },
      conversationHistory: session.conversationHistory ?? [],
    };

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
  CANDIDATE_SPEAKING: ['PROCESSING', 'AI_SPEAKING'],
  PROCESSING: ['AI_GENERATING', 'AI_SPEAKING', 'COMPLETED'],
  COMPLETED: [],
};

export function isValidTransition(from: InterviewState, to: InterviewState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------- Session State Management ----------

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
      assessment: 0,
      closing: 0,
    },
    conversationHistory: [],
  };
  
  sessionStates.set(sessionId, state);
  console.log(`[StateMachine] Session ${sessionId} initialized in READY state`);
  
  return state;
}

export function getSessionState(sessionId: string): SessionState | null {
  return sessionStates.get(sessionId) ?? null;
}

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
  
  if (!isValidTransition(current.state, newState)) {
    console.error(`[StateMachine] Invalid transition: ${current.state} -> ${newState}`);
    return null;
  }
  
  const updated: SessionState = {
    ...current,
    ...updates,
    state: newState,
  };
  
  sessionStates.set(sessionId, updated);
  console.log(`[StateMachine] Session ${sessionId}: ${current.state} -> ${newState}`);
  
  saveStateToDb(sessionId, updated).catch((err) => {
    console.error(`[StateMachine] DB save failed for ${sessionId}:`, err);
  });
  
  return updated;
}

export function getElapsedMinutes(sessionId: string): number {
  const state = sessionStates.get(sessionId);
  if (!state?.startedAt) {
    return 0;
  }
  
  const elapsed = Date.now() - state.startedAt.getTime();
  return Math.floor(elapsed / 1000 / 60);
}

export function getPhaseQuestionCount(sessionId: string): number {
  const state = sessionStates.get(sessionId);
  if (!state) {
    return 0;
  }
  return state.phaseQuestionCounts[state.phase] ?? 0;
}

export function incrementPhaseQuestionCount(sessionId: string): void {
  const state = sessionStates.get(sessionId);
  if (state) {
    state.phaseQuestionCounts[state.phase] = (state.phaseQuestionCounts[state.phase] ?? 0) + 1;
    sessionStates.set(sessionId, state);
    
    saveStateToDb(sessionId, state).catch((err) => {
      console.error(`[StateMachine] DB save failed for ${sessionId}:`, err);
    });
  }
}

export function addToConversationHistory(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): void {
  const state = sessionStates.get(sessionId);
  if (state) {
    state.conversationHistory.push({ role, content });
    sessionStates.set(sessionId, state);
    
    saveStateToDb(sessionId, state).catch((err) => {
      console.error(`[StateMachine] DB save failed for ${sessionId}:`, err);
    });
  }
}

export function getConversationHistory(sessionId: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const state = sessionStates.get(sessionId);
  return state?.conversationHistory ?? [];
}

// ---------- Interview Flow Functions ----------

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
  
  const session = await startSession(sessionId);
  if (!session) {
    console.error(`[StateMachine] Failed to start session in DB`);
    return null;
  }
  
  updateState(sessionId, 'AI_GENERATING', {
    startedAt: new Date(),
  });
  
  return session;
}

export async function changePhase(
  sessionId: string,
  newPhase: AssessmentPhase
): Promise<Session | null> {
  const state = sessionStates.get(sessionId);
  if (!state) {
    console.error(`[StateMachine] Cannot change phase: Session ${sessionId} not found`);
    return null;
  }
  
  const oldPhase = state.phase;
  
  const session = await updateSessionPhase(sessionId, newPhase, 0);
  if (!session) {
    console.error(`[StateMachine] Failed to update phase in DB`);
    return null;
  }
  
  state.phase = newPhase;
  state.questionIndex = 0;
  sessionStates.set(sessionId, state);
  
  console.log(`[StateMachine] Session ${sessionId}: Phase changed ${oldPhase} -> ${newPhase}`);
  
  return session;
}

export async function endInterview(
  sessionId: string,
  reason: 'completed' | 'candidate_left' | 'technical_error' = 'completed'
): Promise<Session | null> {
  const state = sessionStates.get(sessionId);
  if (!state) {
    console.error(`[StateMachine] Cannot end: Session ${sessionId} not found`);
    return null;
  }
  
  const session = await endSession(sessionId, reason);
  if (!session) {
    console.error(`[StateMachine] Failed to end session in DB`);
    return null;
  }
  
  updateState(sessionId, 'COMPLETED');
  
  return session;
}

// ---------- Transcript Functions ----------

export async function saveAIMessage(
  sessionId: string,
  content: string,
  questionContext?: string | null
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
      questionContext: questionContext ?? null,
      timestampMs,
    });
    
    state.lastAIMessage = content;
    sessionStates.set(sessionId, state);
    
    saveStateToDb(sessionId, state).catch((err) => {
      console.error(`[StateMachine] DB save failed for ${sessionId}:`, err);
    });
    
    return entry;
  } catch (error) {
    console.error(`[StateMachine] Failed to save AI message:`, error);
    return null;
  }
}

export async function saveCandidateMessage(
  sessionId: string,
  content: string,
  questionContext?: string | null
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
      questionContext: questionContext ?? null,
      timestampMs,
    });
    
    return entry;
  } catch (error) {
    console.error(`[StateMachine] Failed to save candidate message:`, error);
    return null;
  }
}

// ---------- Cleanup ----------

export function cleanupSessionState(sessionId: string): void {
  sessionStates.delete(sessionId);
  console.log(`[StateMachine] Session ${sessionId} state cleaned up`);
}

export function hasActiveState(sessionId: string): boolean {
  return sessionStates.has(sessionId);
}

// ---------- Reconnect Helpers ----------

export function getReconnectState(savedState: InterviewState): InterviewState {
  switch (savedState) {
    case 'AI_GENERATING':
    case 'AI_SPEAKING':
    case 'WAITING_FOR_CANDIDATE':
    case 'CANDIDATE_SPEAKING':
    case 'PROCESSING':
      return 'AI_SPEAKING';
    case 'COMPLETED':
      return 'COMPLETED';
    default:
      return 'READY';
  }
}

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
  console.log(`[StateMachine] Session ${sessionId}: Force set state to ${newState}`);
  
  saveStateToDb(sessionId, updated).catch((err) => {
    console.error(`[StateMachine] DB save failed for ${sessionId}:`, err);
  });
  
  return updated;
}

export function getActiveSessions(): string[] {
  return Array.from(sessionStates.keys());
}
