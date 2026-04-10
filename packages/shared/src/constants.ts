// ============================================
// ORIENTATION ASSESSMENT - SHARED CONSTANTS
// ============================================

import type { SessionStatus, AssessmentPhase, SpeakerType, SessionEventType } from './types.js';

// ---------- SESSION STATUS ----------

export const SESSION_STATUS: Record<Uppercase<SessionStatus>, SessionStatus> = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const SESSION_STATUSES: SessionStatus[] = [
  'pending',
  'active',
  'completed',
  'failed',
];

// ---------- ASSESSMENT PHASES ----------

export const ASSESSMENT_PHASE: Record<Uppercase<AssessmentPhase>, AssessmentPhase> = {
  INTRODUCTION: 'introduction',
  ASSESSMENT: 'assessment',
  CLOSING: 'closing',
} as const;

export const ASSESSMENT_PHASES: AssessmentPhase[] = [
  'introduction',
  'assessment',
  'closing',
];

export const PHASE_LABELS: Record<AssessmentPhase, string> = {
  introduction: 'Giriş',
  assessment: 'Değerlendirme',
  closing: 'Kapanış',
};

// ---------- SPEAKER TYPES ----------

export const SPEAKER_TYPE: Record<Uppercase<SpeakerType>, SpeakerType> = {
  AI: 'ai',
  CANDIDATE: 'candidate',
} as const;

export const SPEAKER_TYPES: SpeakerType[] = ['ai', 'candidate'];

// ---------- EVENT TYPES ----------

export const SESSION_EVENT_TYPES: SessionEventType[] = [
  'session_created',
  'session_started',
  'session_ended',
  'phase_changed',
  'connection_established',
  'connection_lost',
  'connection_restored',
  'session_takeover',
  'browser_close_detected',
  'interview_resumed',
  'reconnect_failed',
  'interrupt_triggered',
  'error_occurred',
  'callback_sent',
  'camera_face_lost',
  'camera_face_restored',
  'camera_gaze_away',
  'camera_gaze_restored',
  'camera_multi_face',
  'camera_multi_face_restored',
  'camera_error',
];

// ---------- WEBSOCKET EVENTS ----------

export const WS_CLIENT_EVENTS = {
  INTERVIEW_START: 'interview:start',
  INTERVIEW_END: 'interview:end',
  INTERVIEW_RESUME: 'interview:resume',
  CANDIDATE_SPEAKING_START: 'candidate:speaking:start',
  CANDIDATE_SPEAKING_END: 'candidate:speaking:end',
  CANDIDATE_INTERRUPT: 'candidate:interrupt',
  TRANSCRIPT_UPDATE: 'transcript:update',
  CAMERA_INTEGRITY: 'camera:integrity',
} as const;

export const WS_SERVER_EVENTS = {
  CONNECTION_READY: 'connection:ready',
  CONNECTION_ERROR: 'connection:error',
  AI_SPEAKING_START: 'ai:speaking:start',
  AI_SPEAKING_END: 'ai:speaking:end',
  PHASE_CHANGED: 'phase:changed',
  INTERVIEW_ENDED: 'interview:ended',
  ERROR: 'error',
} as const;

// ---------- ERROR CODES ----------

export const REST_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_NOT_COMPLETED: 'SESSION_NOT_COMPLETED',
  SESSION_ALREADY_STARTED: 'SESSION_ALREADY_STARTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export const WS_ERROR_CODES = {
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_COMPLETED: 'SESSION_COMPLETED',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  STT_ERROR: 'STT_ERROR',
  TTS_ERROR: 'TTS_ERROR',
  LLM_ERROR: 'LLM_ERROR',
  AVATAR_ERROR: 'AVATAR_ERROR',
} as const;

// ---------- ASSESSMENT CONFIG ----------

export const MAX_ASSESSMENT_DURATION_MINUTES = 45;
export const DEFAULT_LANGUAGE = 'tr';
