import { create } from 'zustand';
import type {
  SessionStatus,
  AssessmentPhase,
  SpeakerType,
  NetworkMetric,
  RecordingStatus,
  AssessmentSettings,
  VideoRecordingStatus,
} from '@ai-interview/shared';

// ============================================
// ASSESSMENT STORE - ZUSTAND
// ============================================

// ---------- TYPES ----------

export type PageState = 'loading' | 'setup' | 'ready' | 'active' | 'reconnecting' | 'taken_over' | 'closing' | 'completed' | 'error';
export type ReconnectStep = 'connecting' | 'ws_connected' | 'transcript_loaded' | 'avatar_initializing' | 'resuming' | 'done';
export type MicPermission = 'pending' | 'granted' | 'denied';
export type CameraPermission = 'pending' | 'granted' | 'denied';
export type CameraWarningType = 'face_lost' | 'gaze_away' | 'multi_face' | null;
export type InterviewState = 
  | 'idle' 
  | 'ai_generating'
  | 'ai_speaking' 
  | 'waiting_candidate' 
  | 'candidate_speaking'
  | 'processing';
export type ConnectionQuality = 'checking' | 'excellent' | 'good' | 'poor' | 'offline';
export type AudioOutputStatus = 'checking' | 'available' | 'unavailable';
export type InterviewMode = 'avatar' | 'realtime';
export type InterviewTurn = 'ai' | 'candidate';

export interface SessionData {
  sessionId: string;
  candidateName: string;
  assessmentTitle: string;
  totalQuestions: number;
  status: SessionStatus;
  currentPhase: AssessmentPhase;
  currentQuestionIndex: number;
}

export interface TranscriptEntry {
  id: string;
  speaker: SpeakerType;
  content: string;
  timestamp: number;
  phase: AssessmentPhase;
}

export interface CallbackDebugInfo {
  requestPayload: unknown;
  responseStatus: number | null;
  responseBody: unknown;
  success: boolean;
  error?: string;
  durationMs: number;
}

// ---------- STORE INTERFACE ----------

interface InterviewStore {
  // ===== SESSION =====
  session: SessionData | null;

  // ===== PAGE STATE =====
  pageState: PageState;
  error: string | null;

  // ===== SETUP CHECKS =====
  micPermission: MicPermission;
  wsConnected: boolean;
  simliReady: boolean;
  
  // ===== KVKK & NETWORK =====
  kvkkAccepted: boolean;
  connectionQuality: ConnectionQuality;
  bandwidth: number | null;
  audioOutputStatus: AudioOutputStatus;

  // ===== INTERVIEW MODE =====
  interviewMode: InterviewMode;

  // ===== INTERVIEW STATE =====
  interviewState: InterviewState;
  currentPhase: AssessmentPhase;
  currentTurn: InterviewTurn;
  isReconnect: boolean;
  reconnectStep: ReconnectStep;

  // ===== TRANSCRIPT =====
  transcriptEntries: TranscriptEntry[];
  partialTranscript: string;

  // ===== SYSTEM MESSAGE =====
  systemMessage: string | null;

  // ===== TIMER =====
  elapsedSeconds: number;

  // ===== NETWORK METRICS =====
  networkMetrics: NetworkMetric[];
  pingLatency: number | null;
  lastPingTime: number | null;

  // ===== RECORDING STATUS =====
  recordingStatus: RecordingStatus | null;
  recordingMessage: string | null;
  recordingError: string | null;

  // ===== CAMERA =====
  sessionSettings: AssessmentSettings | null;
  cameraEnabled: boolean;
  cameraPermission: CameraPermission;
  faceDetected: boolean;
  gazeOnCamera: boolean;
  cameraWarning: CameraWarningType;
  videoRecordingStatus: VideoRecordingStatus | null;
  videoChunksUploaded: number;

  // ===== CALLBACK DEBUG =====
  callbackDebug: CallbackDebugInfo | null;

  // ===== ACTIONS =====
  setSession: (session: SessionData) => void;
  updateSession: (updates: Partial<SessionData>) => void;

  setPageState: (state: PageState) => void;
  setError: (error: string | null) => void;

  setMicPermission: (status: MicPermission) => void;
  setWsConnected: (connected: boolean) => void;
  setSimliReady: (ready: boolean) => void;
  
  setKvkkAccepted: (accepted: boolean) => void;
  setConnectionQuality: (quality: ConnectionQuality) => void;
  setBandwidth: (bandwidth: number | null) => void;
  setAudioOutputStatus: (status: AudioOutputStatus) => void;

  setInterviewMode: (mode: InterviewMode) => void;

  setInterviewState: (state: InterviewState) => void;
  setPhase: (phase: AssessmentPhase) => void;
  setCurrentTurn: (turn: InterviewTurn) => void;
  setIsReconnect: (isReconnect: boolean) => void;
  setReconnectStep: (step: ReconnectStep) => void;

  addTranscriptEntry: (entry: Omit<TranscriptEntry, 'id' | 'timestamp'>) => void;
  setPartialTranscript: (text: string) => void;
  clearPartialTranscript: () => void;

  setSystemMessage: (message: string | null) => void;

  tick: () => void;
  resetTimer: () => void;

  addNetworkMetric: (metric: NetworkMetric) => void;
  clearNetworkMetrics: () => void;
  setPingLatency: (latency: number | null) => void;

  setRecordingStatus: (status: RecordingStatus, message: string, error?: string) => void;

  setSessionSettings: (settings: AssessmentSettings | null) => void;
  setCameraEnabled: (enabled: boolean) => void;
  setCameraPermission: (permission: CameraPermission) => void;
  setFaceDetected: (detected: boolean) => void;
  setGazeOnCamera: (onCamera: boolean) => void;
  setCameraWarning: (warning: CameraWarningType) => void;
  setVideoRecordingStatus: (status: VideoRecordingStatus | null) => void;
  setVideoChunksUploaded: (count: number) => void;

  setCallbackDebug: (debug: CallbackDebugInfo) => void;

  loadExistingTranscript: (entries: Array<{
    speaker: SpeakerType;
    content: string;
    phase: AssessmentPhase;
    timestamp: number;
  }>) => void;
  setElapsedSeconds: (seconds: number) => void;

  reset: () => void;
}

// ---------- INITIAL STATE ----------

const initialState = {
  session: null,

  pageState: 'loading' as PageState,
  error: null,

  micPermission: 'pending' as MicPermission,
  wsConnected: false,
  simliReady: false,
  
  kvkkAccepted: false,
  connectionQuality: 'checking' as ConnectionQuality,
  bandwidth: null,
  audioOutputStatus: 'checking' as AudioOutputStatus,

  interviewMode: 'avatar' as InterviewMode,

  interviewState: 'idle' as InterviewState,
  currentPhase: 'introduction' as AssessmentPhase,
  currentTurn: 'ai' as InterviewTurn,
  isReconnect: false,
  reconnectStep: 'connecting' as ReconnectStep,

  transcriptEntries: [],
  partialTranscript: '',

  systemMessage: null,

  elapsedSeconds: 0,

  networkMetrics: [] as NetworkMetric[],
  pingLatency: null,
  lastPingTime: null,

  recordingStatus: null as RecordingStatus | null,
  recordingMessage: null as string | null,
  recordingError: null as string | null,

  sessionSettings: null as AssessmentSettings | null,
  cameraEnabled: false,
  cameraPermission: 'pending' as CameraPermission,
  faceDetected: true,
  gazeOnCamera: true,
  cameraWarning: null as CameraWarningType,
  videoRecordingStatus: null as VideoRecordingStatus | null,
  videoChunksUploaded: 0,

  callbackDebug: null as CallbackDebugInfo | null,
};

// ---------- STORE CREATION ----------

export const useInterviewStore = create<InterviewStore>((set, get) => ({
  ...initialState,

  setSession: (session) => set({ session }),

  updateSession: (updates) => set((state) => ({
    session: state.session ? { ...state.session, ...updates } : null,
  })),

  setPageState: (pageState) => set({ pageState }),

  setError: (error) => set({ error, pageState: error ? 'error' : get().pageState }),

  setMicPermission: (micPermission) => {
    set({ micPermission });
    const state = get();
    if (state.pageState === 'setup' && micPermission === 'granted' && state.wsConnected) {
      set({ pageState: 'ready' });
    }
  },

  setWsConnected: (wsConnected) => {
    set({ wsConnected });
    const state = get();
    if (state.pageState === 'setup' && state.micPermission === 'granted' && wsConnected) {
      set({ pageState: 'ready' });
    }
  },

  setSimliReady: (simliReady) => set({ simliReady }),

  setKvkkAccepted: (kvkkAccepted) => set({ kvkkAccepted }),
  setConnectionQuality: (connectionQuality) => set({ connectionQuality }),
  setBandwidth: (bandwidth) => set({ bandwidth }),
  setAudioOutputStatus: (audioOutputStatus) => set({ audioOutputStatus }),

  setInterviewMode: (interviewMode) => set({ interviewMode }),

  setInterviewState: (interviewState) => set({ interviewState }),
  setPhase: (currentPhase) => set({ currentPhase }),
  setCurrentTurn: (currentTurn) => set({ currentTurn }),
  setIsReconnect: (isReconnect) => set({ isReconnect }),
  setReconnectStep: (reconnectStep) => set({ reconnectStep }),

  addTranscriptEntry: (entry) => set((state) => ({
    transcriptEntries: [
      ...state.transcriptEntries,
      {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      },
    ],
  })),

  setPartialTranscript: (partialTranscript) => set({ partialTranscript }),
  clearPartialTranscript: () => set({ partialTranscript: '' }),

  setSystemMessage: (systemMessage) => set({ systemMessage }),

  tick: () => set((state) => ({ elapsedSeconds: state.elapsedSeconds + 1 })),
  resetTimer: () => set({ elapsedSeconds: 0 }),

  addNetworkMetric: (metric) => set((state) => ({
    networkMetrics: [...state.networkMetrics, metric],
  })),
  clearNetworkMetrics: () => set({ networkMetrics: [] }),
  setPingLatency: (pingLatency) => set({ 
    pingLatency, 
    lastPingTime: pingLatency !== null ? Date.now() : null 
  }),

  setRecordingStatus: (recordingStatus, recordingMessage, recordingError) => set({
    recordingStatus,
    recordingMessage,
    recordingError: recordingError ?? null,
  }),

  setSessionSettings: (sessionSettings) => {
    const cameraEnabled = sessionSettings?.cameraMonitoring ?? false;
    set({ sessionSettings, cameraEnabled });
  },

  setCameraEnabled: (cameraEnabled) => set({ cameraEnabled }),
  setCameraPermission: (cameraPermission) => set({ cameraPermission }),
  setFaceDetected: (faceDetected) => set({ faceDetected }),
  setGazeOnCamera: (gazeOnCamera) => set({ gazeOnCamera }),
  setCameraWarning: (cameraWarning) => set({ cameraWarning }),
  setVideoRecordingStatus: (videoRecordingStatus) => set({ videoRecordingStatus }),
  setVideoChunksUploaded: (videoChunksUploaded) => set({ videoChunksUploaded }),

  setCallbackDebug: (callbackDebug) => set({ callbackDebug }),

  loadExistingTranscript: (entries) => set({
    transcriptEntries: entries.map((entry, index) => ({
      id: `${entry.timestamp}-${index}`,
      speaker: entry.speaker,
      content: entry.content,
      phase: entry.phase,
      timestamp: entry.timestamp,
    })),
  }),

  setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),

  reset: () => set(initialState),
}));

// ---------- SELECTORS ----------

export const selectSession = (state: InterviewStore) => state.session;
export const selectPageState = (state: InterviewStore) => state.pageState;
export const selectInterviewState = (state: InterviewStore) => state.interviewState;
export const selectTranscript = (state: InterviewStore) => state.transcriptEntries;
export const selectIsReady = (state: InterviewStore) => 
  state.micPermission === 'granted' && state.wsConnected;
export const selectFormattedTime = (state: InterviewStore) => {
  const minutes = Math.floor(state.elapsedSeconds / 60);
  const seconds = state.elapsedSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};
export const selectNetworkMetrics = (state: InterviewStore) => state.networkMetrics;
export const selectInterviewMode = (state: InterviewStore) => state.interviewMode;
export const selectCurrentTurn = (state: InterviewStore) => state.currentTurn;
