// ============================================
// AI INTERVIEW - SHARED TYPES
// ============================================

// ---------- ENUMS ----------

export type SessionStatus = 'pending' | 'active' | 'completed' | 'failed';

export type InterviewPhase = 
  | 'introduction'
  | 'experience'
  | 'technical'
  | 'behavioral'
  | 'motivation'
  | 'closing';

export type SpeakerType = 'ai' | 'candidate';

// 1: Nice to have, 2: Low, 3: Medium, 4: High, 5: Critical (must have)
export type TopicImportance = 1 | 2 | 3 | 4 | 5;

// ---------- SESSION ----------

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Session {
  id: string;
  status: SessionStatus;
  currentPhase: InterviewPhase;
  currentQuestionIndex: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // Session persistence fields (optional - only present when loaded)
  conversationHistory?: ConversationMessage[];
  lastAiMessage?: string | null;
  phaseQuestionCounts?: Record<InterviewPhase, number>;
  interviewState?: string;
}

// ---------- INTERVIEW CONFIG ----------

export interface Company {
  name: string;
  industry?: string;
  size?: string;
  tech_stack?: string[];
}

export interface Position {
  company: Company;
  title: string;
  responsibilities: string[];
  requirements: string[];
}

export interface Experience {
  title: string;
  company: string;
  duration: string;
  description?: string;
}

export interface Education {
  degree: string;
  school: string;
  duration: string;
  gpa?: string;
}

export interface Candidate {
  name: string;
  experiences?: Experience[];
  education?: Education[];
  skills?: string[];
}

export interface TopicScoring {
  scale: string;
  minimum_expected: number;
  importance: TopicImportance;
}

export interface InterviewTopic {
  category: 'technical' | 'behavioral' | 'experience' | 'motivation' | 'soft_skills';
  topic: string;
  description?: string;
  scoring?: TopicScoring;
  evaluation_guide?: string;
}

// ---------- SESSION SETTINGS ----------

export interface CameraSettings {
  enabled: boolean;
  recordVideo?: boolean; // default true when camera enabled
}

export interface SessionSettings {
  camera?: CameraSettings;
}

export interface InterviewConfig {
  id: string;
  sessionId: string;
  positionData: Position;
  candidateData: Candidate;
  topics: InterviewTopic[];
  settings?: SessionSettings;
  createdAt: string;
  deletedAt: string | null;
}

// ---------- TRANSCRIPT ----------

export interface TranscriptEntry {
  id: string;
  sessionId: string;
  sequenceNumber: number;
  speaker: SpeakerType;
  content: string;
  phase: InterviewPhase;
  questionContext: string | null;
  timestampMs: number;
  createdAt: string;
  deletedAt: string | null;
}

// ---------- SESSION EVENTS ----------

export type SessionEventType =
  | 'session_created'
  | 'session_started'
  | 'session_ended'
  | 'phase_changed'
  | 'connection_established'
  | 'connection_lost'
  | 'connection_restored'
  | 'session_takeover'
  | 'browser_close_detected'
  | 'interview_resumed'
  | 'reconnect_failed'
  | 'interrupt_triggered'
  | 'error_occurred'
  | 'ats_callback_sent'
  | 'camera_face_lost'
  | 'camera_face_restored'
  | 'camera_gaze_away'
  | 'camera_gaze_restored'
  | 'camera_multi_face'
  | 'camera_multi_face_restored'
  | 'camera_error';

export interface SessionEvent {
  id: string;
  sessionId: string;
  eventType: SessionEventType;
  eventData: Record<string, unknown> | null;
  createdAt: string;
}

// ---------- API TYPES ----------

export interface CreateSessionRequest {
  position: Position;
  interview_topics: InterviewTopic[];
  candidate: Candidate;
  settings?: SessionSettings;
}

export interface CreateSessionResponse {
  success: true;
  data: {
    sessionId: string;
    joinUrl: string;
    status: SessionStatus;
    createdAt: string;
  };
}

export interface GetSessionResponse {
  success: true;
  data: {
    sessionId: string;
    status: SessionStatus;
    currentPhase: InterviewPhase;
    currentQuestionIndex: number;
    startedAt: string | null;
    endedAt: string | null;
    createdAt: string;
    candidate: {
      name: string;
    };
    position: {
      title: string;
      company: string;
    };
  };
}

export interface TranscriptEntryResponse {
  sequence: number;
  speaker: SpeakerType;
  content: string;
  phase: InterviewPhase;
  topic: string | null;
  timestampMs: number;
}

export interface GetTranscriptResponse {
  success: true;
  data: {
    sessionId: string;
    status: SessionStatus;
    candidate: {
      name: string;
    };
    position: {
      title: string;
      company: string;
    };
    duration: {
      startedAt: string;
      endedAt: string;
      totalMinutes: number;
    };
    entries: TranscriptEntryResponse[];
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

// ---------- WEBSOCKET EVENTS ----------

// Client → Server
export interface WSInterviewStartEvent {
  event: 'interview:start';
  data: Record<string, never>;
}

export interface WSInterviewEndEvent {
  event: 'interview:end';
  data: {
    reason: 'completed' | 'candidate_left' | 'technical_error';
  };
}

export interface WSCandidateSpeakingStartEvent {
  event: 'candidate:speaking:start';
  data: Record<string, never>;
}

export interface WSCandidateSpeakingEndEvent {
  event: 'candidate:speaking:end';
  data: Record<string, never>;
}

export interface WSCandidateInterruptEvent {
  event: 'candidate:interrupt';
  data: Record<string, never>;
}

export interface WSTranscriptUpdateEvent {
  event: 'transcript:update';
  data: {
    text: string;
    isFinal: boolean;
  };
}

export interface WSInterviewResumeEvent {
  event: 'interview:resume';
  data: Record<string, never>;
}

export type CameraIntegrityType =
  | 'face_lost' | 'face_restored'
  | 'gaze_away' | 'gaze_restored'
  | 'multi_face' | 'multi_face_restored';

export interface WSCameraIntegrityEvent {
  event: 'camera:integrity';
  data: {
    type: CameraIntegrityType;
    timestamp: number;
    interviewSecond?: number;
  };
}

export type CameraViolationType = 'face_lost' | 'gaze_away' | 'multi_face';

export interface CameraViolation {
  type: CameraViolationType;
  interviewSecond: number;
  timestamp: string;
}

export interface CameraViolationReport {
  violations: CameraViolation[];
  summary: {
    faceLostCount: number;
    gazeAwayCount: number;
    multiFaceCount: number;
    totalViolations: number;
  };
}

export type WSClientEvent =
  | WSInterviewStartEvent
  | WSInterviewEndEvent
  | WSCandidateSpeakingStartEvent
  | WSCandidateSpeakingEndEvent
  | WSCandidateInterruptEvent
  | WSTranscriptUpdateEvent
  | WSInterviewResumeEvent
  | WSCameraIntegrityEvent;

// Server → Client
export interface WSConnectionReadyEvent {
  event: 'connection:ready';
  data: {
    sessionId: string;
    status: SessionStatus;
    currentPhase: InterviewPhase;
    currentQuestionIndex: number;
    candidate: {
      name: string;
    };
    position: {
      title: string;
      company: string;
    };
    config: {
      phases: InterviewPhase[];
    };
    settings?: SessionSettings;
    // Reconnection data (optional - only present for active sessions)
    isReconnect?: boolean;
    existingTranscript?: Array<{
      speaker: SpeakerType;
      content: string;
      phase: InterviewPhase;
      timestamp: number;
    }>;
    elapsedSeconds?: number;
  };
}

export interface WSConnectionErrorEvent {
  event: 'connection:error';
  data: {
    code: string;
    message: string;
  };
}

export interface WSAiGeneratingStartEvent {
  event: 'ai:generating:start';
  data: Record<string, never>;
}

export interface WSAiGeneratingEndEvent {
  event: 'ai:generating:end';
  data: Record<string, never>;
}

// Görüşmede sıranın kimde olduğunu belirtir
export type InterviewTurn = 'ai' | 'candidate';

export interface WSAiSpeakingStartEvent {
  event: 'ai:speaking:start';
  data: {
    text: string;
    phase: InterviewPhase;
    topic: string | null;
    reasoning: string | null; // AI'ın neden bu soruyu sorduğunun kısa açıklaması (demo modu için)
    turn: InterviewTurn; // Sıra kimde? AI kısa cevap verip devam edecekse 'ai', aday cevap verecekse 'candidate'
  };
}

export interface WSAiSpeakingEndEvent {
  event: 'ai:speaking:end';
  data: Record<string, never>;
}

export interface WSPhaseChangedEvent {
  event: 'phase:changed';
  data: {
    from: InterviewPhase;
    to: InterviewPhase;
    questionIndex: number;
  };
}

export interface WSQuestionNewEvent {
  event: 'question:new';
  data: {
    phase: InterviewPhase;
    topic: string | null;
    questionIndex: number;
  };
}

export interface WSInterviewEndedEvent {
  event: 'interview:ended';
  data: {
    reason: 'completed' | 'candidate_left' | 'technical_error';
    duration: {
      totalMinutes: number;
    };
  };
}

export interface WSErrorEvent {
  event: 'error';
  data: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

// ---------- NETWORK METRICS ----------

export type NetworkMetricService = 'openai' | 'elevenlabs' | 'whisper' | 'simli';

export interface NetworkMetricRequestDetails {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: {
    model?: string;
    systemPrompt?: string;
    userMessage?: string;
    messages?: Array<{ role: string; content: string }>;
    [key: string]: unknown;
  };
}

export interface NetworkMetricResponseDetails {
  status?: number;
  content?: string;
  parsed?: unknown;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface NetworkMetric {
  id: string;
  service: NetworkMetricService;
  operation: string;
  durationMs: number;
  inputSize?: number;  // bytes
  outputSize?: number; // bytes
  timestamp: number;
  metadata?: {
    // Common
    model?: string;
    
    // OpenAI specific (tokens)
    inputTokens?: number;
    outputTokens?: number;
    
    // ElevenLabs specific (characters)
    textLength?: number;
    voiceId?: string;
    audioDurationMs?: number;
    
    // Whisper specific (audio duration)
    audioLengthMs?: number;
    
    // Simli specific
    chunks?: number;
    faceId?: string;
    
    // Other
    phase?: string;
    [key: string]: unknown;
  };
  requestDetails?: NetworkMetricRequestDetails;
  responseDetails?: NetworkMetricResponseDetails;
}

export interface WSNetworkMetricEvent {
  event: 'network:metric';
  data: NetworkMetric;
}

// ---------- RECORDING STATUS ----------

export type RecordingStatus = 'recording' | 'processing' | 'completed' | 'failed';

export type VideoRecordingStatus = 'recording' | 'processing' | 'completed' | 'failed';

export interface WSRecordingStatusEvent {
  event: 'recording:status';
  data: {
    status: RecordingStatus;
    message: string;
    error?: string;
    recordingUrl?: string;
  };
}

export interface WSVideoRecordingStatusEvent {
  event: 'video:recording:status';
  data: {
    status: VideoRecordingStatus;
    message: string;
    error?: string;
    videoUrl?: string;
  };
}

export type WSServerEvent =
  | WSConnectionReadyEvent
  | WSConnectionErrorEvent
  | WSAiGeneratingStartEvent
  | WSAiGeneratingEndEvent
  | WSAiSpeakingStartEvent
  | WSAiSpeakingEndEvent
  | WSPhaseChangedEvent
  | WSQuestionNewEvent
  | WSInterviewEndedEvent
  | WSErrorEvent
  | WSNetworkMetricEvent
  | WSRecordingStatusEvent
  | WSVideoRecordingStatusEvent;

// All WS Events
export type WSEvent = WSClientEvent | WSServerEvent;
