import { create } from 'zustand';
import type {
  SessionStatus,
  InterviewPhase,
  SpeakerType,
  NetworkMetric,
  RecordingStatus,
  SessionSettings,
  VideoRecordingStatus,
} from '@ai-interview/shared';

// ============================================
// INTERVIEW STORE - ZUSTAND
// ============================================

// ---------- TYPES ----------

export type PageState = 'loading' | 'setup' | 'ready' | 'active' | 'reconnecting' | 'taken_over' | 'completed' | 'error';
export type ReconnectStep = 'connecting' | 'ws_connected' | 'transcript_loaded' | 'avatar_initializing' | 'resuming' | 'done';
export type MicPermission = 'pending' | 'granted' | 'denied';
export type CameraPermission = 'pending' | 'granted' | 'denied';
export type CameraWarningType = 'face_lost' | 'gaze_away' | 'multi_face' | null;
export type InterviewState = 
  | 'idle' 
  | 'ai_generating'      // AI düşünüyor
  | 'ai_speaking' 
  | 'waiting_candidate' 
  | 'candidate_speaking'
  | 'processing';        // Yanıt işleniyor
export type ConnectionQuality = 'checking' | 'excellent' | 'good' | 'poor' | 'offline';
export type AudioOutputStatus = 'checking' | 'available' | 'unavailable';
export type InterviewMode = 'avatar' | 'realtime'; // V1: Avatar (Simli), V2: Realtime (OpenAI)
export type InterviewTurn = 'ai' | 'candidate'; // Sıra kimde?

export interface SessionData {
  sessionId: string;
  candidateName: string;
  positionTitle: string;
  companyName: string;
  status: SessionStatus;
  currentPhase: InterviewPhase;
  currentQuestionIndex: number;
}

export interface TranscriptEntry {
  id: string;
  speaker: SpeakerType;
  content: string;
  timestamp: number;
  phase: InterviewPhase;
  reasoning?: string | null; // AI'ın neden bu soruyu sorduğunun kısa açıklaması (sadece AI mesajları için)
}

export interface ConnectionConfig {
  phases: InterviewPhase[];
}

// ---------- STORE INTERFACE ----------

interface InterviewStore {
  // ===== SESSION =====
  session: SessionData | null;
  config: ConnectionConfig | null;

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
  bandwidth: number | null; // Mbps
  audioOutputStatus: AudioOutputStatus;

  // ===== INTERVIEW MODE =====
  interviewMode: InterviewMode; // V1: Avatar, V2: Realtime

  // ===== INTERVIEW STATE =====
  interviewState: InterviewState;
  currentPhase: InterviewPhase;
  currentTurn: InterviewTurn; // Sıra kimde? 'ai' veya 'candidate'
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
  sessionSettings: SessionSettings | null;
  cameraEnabled: boolean;
  cameraPermission: CameraPermission;
  faceDetected: boolean;
  gazeOnCamera: boolean;
  cameraWarning: CameraWarningType;
  videoRecordingStatus: VideoRecordingStatus | null;

  // ===== ACTIONS =====
  // Session
  setSession: (session: SessionData) => void;
  setConfig: (config: ConnectionConfig) => void;
  updateSession: (updates: Partial<SessionData>) => void;

  // Page State
  setPageState: (state: PageState) => void;
  setError: (error: string | null) => void;

  // Setup Checks
  setMicPermission: (status: MicPermission) => void;
  setWsConnected: (connected: boolean) => void;
  setSimliReady: (ready: boolean) => void;
  
  // KVKK & Network
  setKvkkAccepted: (accepted: boolean) => void;
  setConnectionQuality: (quality: ConnectionQuality) => void;
  setBandwidth: (bandwidth: number | null) => void;
  setAudioOutputStatus: (status: AudioOutputStatus) => void;

  // Interview Mode
  setInterviewMode: (mode: InterviewMode) => void;

  // Interview State
  setInterviewState: (state: InterviewState) => void;
  setPhase: (phase: InterviewPhase) => void;
  setCurrentTurn: (turn: InterviewTurn) => void;
  setIsReconnect: (isReconnect: boolean) => void;
  setReconnectStep: (step: ReconnectStep) => void;

  // Transcript
  addTranscriptEntry: (entry: Omit<TranscriptEntry, 'id' | 'timestamp'>) => void;
  setPartialTranscript: (text: string) => void;
  clearPartialTranscript: () => void;

  // System Message
  setSystemMessage: (message: string | null) => void;

  // Timer
  tick: () => void;
  resetTimer: () => void;

  // Network Metrics
  addNetworkMetric: (metric: NetworkMetric) => void;
  clearNetworkMetrics: () => void;
  setPingLatency: (latency: number | null) => void;

  // Recording Status
  setRecordingStatus: (status: RecordingStatus, message: string, error?: string) => void;

  // Camera
  setSessionSettings: (settings: SessionSettings | null) => void;
  setCameraEnabled: (enabled: boolean) => void;
  setCameraPermission: (permission: CameraPermission) => void;
  setFaceDetected: (detected: boolean) => void;
  setGazeOnCamera: (onCamera: boolean) => void;
  setCameraWarning: (warning: CameraWarningType) => void;
  setVideoRecordingStatus: (status: VideoRecordingStatus | null) => void;

  // Load Existing Data (for reconnect)
  loadExistingTranscript: (entries: Array<{
    speaker: SpeakerType;
    content: string;
    phase: InterviewPhase;
    timestamp: number;
  }>) => void;
  setElapsedSeconds: (seconds: number) => void;

  // Full Reset
  reset: () => void;
}

// ---------- INITIAL STATE ----------

const initialState = {
  // Session
  session: null,
  config: null,

  // Page State
  pageState: 'loading' as PageState,
  error: null,

  // Setup Checks
  micPermission: 'pending' as MicPermission,
  wsConnected: false,
  simliReady: false,
  
  // KVKK & Network
  kvkkAccepted: false,
  connectionQuality: 'checking' as ConnectionQuality,
  bandwidth: null,
  audioOutputStatus: 'checking' as AudioOutputStatus,

  // Interview Mode
  interviewMode: 'avatar' as InterviewMode, // Default: Avatar mode

  // Interview State
  interviewState: 'idle' as InterviewState,
  currentPhase: 'introduction' as InterviewPhase,
  currentTurn: 'ai' as InterviewTurn, // Başlangıçta sıra AI'da
  isReconnect: false,
  reconnectStep: 'connecting' as ReconnectStep,

  // Transcript
  transcriptEntries: [],
  partialTranscript: '',

  // System Message
  systemMessage: null,

  // Timer
  elapsedSeconds: 0,

  // Network Metrics
  networkMetrics: [] as NetworkMetric[],
  pingLatency: null,
  lastPingTime: null,

  // Recording Status
  recordingStatus: null as RecordingStatus | null,
  recordingMessage: null as string | null,
  recordingError: null as string | null,

  // Camera
  sessionSettings: null as SessionSettings | null,
  cameraEnabled: false,
  cameraPermission: 'pending' as CameraPermission,
  faceDetected: true,
  gazeOnCamera: true,
  cameraWarning: null as CameraWarningType,
  videoRecordingStatus: null as VideoRecordingStatus | null,
};

// ---------- STORE CREATION ----------

export const useInterviewStore = create<InterviewStore>((set, get) => ({
  ...initialState,

  // ===== SESSION ACTIONS =====

  setSession: (session) => set({ session }),

  setConfig: (config) => set({ config }),

  updateSession: (updates) => set((state) => ({
    session: state.session ? { ...state.session, ...updates } : null,
  })),

  // ===== PAGE STATE ACTIONS =====

  setPageState: (pageState) => set({ pageState }),

  setError: (error) => set({ error, pageState: error ? 'error' : get().pageState }),

  // ===== SETUP CHECKS ACTIONS =====

  setMicPermission: (micPermission) => {
    set({ micPermission });
    
    // Auto-transition to ready if all checks pass
    const state = get();
    if (
      state.pageState === 'setup' &&
      micPermission === 'granted' &&
      state.wsConnected
    ) {
      set({ pageState: 'ready' });
    }
  },

  setWsConnected: (wsConnected) => {
    set({ wsConnected });
    
    // Auto-transition to ready if all checks pass (only for non-reconnect flows)
    const state = get();
    if (
      state.pageState === 'setup' &&
      state.micPermission === 'granted' &&
      wsConnected
    ) {
      set({ pageState: 'ready' });
    }
  },

  setSimliReady: (simliReady) => set({ simliReady }),

  // ===== KVKK & NETWORK ACTIONS =====

  setKvkkAccepted: (kvkkAccepted) => set({ kvkkAccepted }),

  setConnectionQuality: (connectionQuality) => set({ connectionQuality }),

  setBandwidth: (bandwidth) => set({ bandwidth }),

  setAudioOutputStatus: (audioOutputStatus) => set({ audioOutputStatus }),

  // ===== INTERVIEW MODE ACTIONS =====

  setInterviewMode: (interviewMode) => set({ interviewMode }),

  // ===== INTERVIEW STATE ACTIONS =====

  setInterviewState: (interviewState) => set({ interviewState }),

  setPhase: (currentPhase) => set({ currentPhase }),

  setCurrentTurn: (currentTurn) => set({ currentTurn }),

  setIsReconnect: (isReconnect) => set({ isReconnect }),

  setReconnectStep: (reconnectStep) => set({ reconnectStep }),

  // ===== TRANSCRIPT ACTIONS =====

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

  // ===== SYSTEM MESSAGE ACTIONS =====

  setSystemMessage: (systemMessage) => set({ systemMessage }),

  // ===== TIMER ACTIONS =====

  tick: () => set((state) => ({
    elapsedSeconds: state.elapsedSeconds + 1,
  })),

  resetTimer: () => set({ elapsedSeconds: 0 }),

  // ===== NETWORK METRICS ACTIONS =====

  addNetworkMetric: (metric) => set((state) => ({
    networkMetrics: [...state.networkMetrics, metric],
  })),

  clearNetworkMetrics: () => set({ networkMetrics: [] }),

  setPingLatency: (pingLatency) => set({ 
    pingLatency, 
    lastPingTime: pingLatency !== null ? Date.now() : null 
  }),

  // ===== RECORDING STATUS ACTIONS =====

  setRecordingStatus: (recordingStatus, recordingMessage, recordingError) => set({
    recordingStatus,
    recordingMessage,
    recordingError: recordingError ?? null,
  }),

  // ===== CAMERA ACTIONS =====

  setSessionSettings: (sessionSettings) => {
    const cameraEnabled = sessionSettings?.camera?.enabled ?? false;
    set({ sessionSettings, cameraEnabled });
  },

  setCameraEnabled: (cameraEnabled) => set({ cameraEnabled }),

  setCameraPermission: (cameraPermission) => set({ cameraPermission }),

  setFaceDetected: (faceDetected) => set({ faceDetected }),

  setGazeOnCamera: (gazeOnCamera) => set({ gazeOnCamera }),

  setCameraWarning: (cameraWarning) => set({ cameraWarning }),

  setVideoRecordingStatus: (videoRecordingStatus) => set({ videoRecordingStatus }),

  // ===== LOAD EXISTING DATA (RECONNECT) =====

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

  // ===== FULL RESET =====

  reset: () => set(initialState),
}));

// ---------- SELECTORS (Convenience) ----------

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