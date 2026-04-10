'use client';

import { useEffect, useRef } from 'react';
import { useInterviewStore } from '@/stores/interviewStore';
import { Avatar } from './Avatar';
import { CameraPreview } from './CameraPreview';
import { CameraWarning } from './CameraWarning';
import type { FaceDetectionDebugData } from '@/hooks/useFaceDetection';
import { TranscriptPanel } from './TranscriptPanel';
import { PhaseIndicator } from './PhaseIndicator';
import { ControlBar } from './ControlBar';
import { Timer } from './Timer';
import { ConnectionIndicator } from './ConnectionIndicator';
import { NetworkMetricsPanel } from './NetworkMetricsPanel';
import { ConnectionStatus } from './ConnectionStatus';
import { CheckCircle, Copy, Check, X, Lightbulb, Bug, PhoneOff, Loader2, Radio, Brain, Disc3, Sparkles } from 'lucide-react';
import { useState } from 'react';
import Image from 'next/image';
import { sessionLogger } from '@/lib/sessionLogger';
import type { CallbackDebugInfo } from '@/stores/interviewStore';

// ============================================
// ACTIVE SCREEN
// ============================================
// Main interview screen with avatar, transcript, and controls

interface ActiveScreenProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onEndCall: () => void;
  onStartListening: () => Promise<boolean>;
  onStopListening: () => Promise<void>;
  isListening: boolean;
  isProcessing: boolean;
  recordingSeconds: number;
  isAudioPlaying: boolean;
  onSimliInit?: () => Promise<boolean>;
  onStartInterview?: () => void;
  isClosing?: boolean;
  isCompleted?: boolean;
  onCloseSimli?: () => void;
  onCleanupMedia?: () => void;
  onResumeAfterReconnect?: () => void;
  cameraStream?: MediaStream | null;
  cameraVideoRef?: React.RefObject<HTMLVideoElement | null>;
  faceDetectionDebugData?: FaceDetectionDebugData | null;
}

export function ActiveScreen({
  videoRef,
  audioRef,
  onEndCall,
  onStartListening,
  onStopListening,
  isListening,
  isProcessing,
  recordingSeconds,
  isAudioPlaying,
  onSimliInit,
  onStartInterview,
  isClosing = false,
  isCompleted = false,
  onCloseSimli,
  onCleanupMedia,
  onResumeAfterReconnect,
  cameraStream,
  cameraVideoRef,
  faceDetectionDebugData,
}: ActiveScreenProps) {
  const session = useInterviewStore((state) => state.session);
  const interviewState = useInterviewStore((state) => state.interviewState);
  const currentTurn = useInterviewStore((state) => state.currentTurn);
  const tick = useInterviewStore((state) => state.tick);
  const simliReady = useInterviewStore((state) => state.simliReady);
  const elapsedSeconds = useInterviewStore((state) => state.elapsedSeconds);
  const transcriptEntries = useInterviewStore((state) => state.transcriptEntries);
  const isReconnect = useInterviewStore((state) => state.isReconnect);
  const callbackDebug = useInterviewStore((state) => state.callbackDebug);
  const simliInitAttempted = useRef(false);
  const interviewStarted = useRef(false);
  const simliClosedRef = useRef(false);
  const simliTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [simliTimedOut, setSimliTimedOut] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [showCompletedOverlay, setShowCompletedOverlay] = useState(false);
  const [showReconnectOverlay, setShowReconnectOverlay] = useState(isReconnect);
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showResultsOverlay, setShowResultsOverlay] = useState(false);
  const closingAudioDoneRef = useRef(false);
  const reconnectResumed = useRef(false);

  // Initialization loading overlay
  type InitStep = 'avatar' | 'questions' | 'recording' | 'ready' | 'done';
  const [initStep, setInitStep] = useState<InitStep>('avatar');
  const [showInitOverlay, setShowInitOverlay] = useState(!isReconnect);
  const initOverlayDismissed = useRef(false);

  // Reconnect: kullanıcı "Görüşmeye Devam Et" butonuna tıklayınca
  // 1. AudioContext'i kullanıcı jesti içinde unlock et (Chrome autoplay policy)
  // 2. Simli'yi init et (DOM ref'leri mevcut + AudioContext izinli)
  // 3. Simli WebRTC tam hazır olunca interview:resume gönder (effect ile)
  const handleReconnectClick = async () => {
    setReconnectLoading(true);

    // Step 1: Unlock AudioContext within user gesture (critical for Chrome)
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      // Play a silent buffer to fully activate audio permission
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      console.log('[ActiveScreen] Audio context unlocked via user gesture');
    } catch (e) {
      console.warn('[ActiveScreen] Audio unlock failed:', e);
    }

    // Step 2: Initialize Simli within user gesture context
    // NOT: simliClient.start() resolve olması ≠ WebRTC hazır
    // WebRTC hazır olunca 'connected' event tetiklenir ve simliReady=true olur
    // Step 3 (interview:resume) aşağıdaki effect tarafından simliReady olunca yapılacak
    if (onSimliInit && !simliReady) {
      simliInitAttempted.current = true;
      console.log('[ActiveScreen] Reconnect: Initializing Simli (user gesture context)');
      await onSimliInit();
      console.log('[ActiveScreen] Reconnect: Simli init started, waiting for WebRTC connection...');

      // Timeout for reconnect Simli init
      simliTimeoutRef.current = setTimeout(() => {
        if (reconnectLoading && !reconnectResumed.current) {
          console.warn('[ActiveScreen] Reconnect: Simli timeout - resuming without avatar');
          setSimliTimedOut(true);
        }
      }, 10000);
    }
  };

  // Step 3: Simli WebRTC tam hazır olduğunda VEYA timeout olduğunda interview:resume gönder
  useEffect(() => {
    const canResume = simliReady || simliTimedOut;
    if (reconnectLoading && canResume && !reconnectResumed.current) {
      console.log(`[ActiveScreen] Reconnect: resuming (simli: ${simliReady ? 'ready' : 'unavailable'})`);
      reconnectResumed.current = true;
      if (simliTimeoutRef.current) {
        clearTimeout(simliTimeoutRef.current);
        simliTimeoutRef.current = null;
      }
      setShowReconnectOverlay(false);
      setReconnectLoading(false);
      if (onResumeAfterReconnect) {
        onResumeAfterReconnect();
      }
    }
  }, [reconnectLoading, simliReady, simliTimedOut, onResumeAfterReconnect]);

  // Timer interval - pause when closing or completed
  useEffect(() => {
    if (isClosing || isCompleted) return;
    
    const interval = setInterval(() => {
      tick();
    }, 1000);

    return () => clearInterval(interval);
  }, [tick, isClosing, isCompleted]);

  // Closing flow: wait for audio to finish, then show results overlay
  useEffect(() => {
    if (!isClosing || closingAudioDoneRef.current) return;

    if (!isAudioPlaying) {
      closingAudioDoneRef.current = true;
      console.log('[ActiveScreen] Closing audio finished, showing results overlay');

      if (onCloseSimli && !simliClosedRef.current) {
        console.log('[ActiveScreen] Closing Simli connection (closing flow)');
        onCloseSimli();
        simliClosedRef.current = true;
      }

      // Stop camera, video recording, face detection so video commit triggers callback
      if (onCleanupMedia) {
        onCleanupMedia();
      }

      setShowResultsOverlay(true);
    }
  }, [isClosing, isAudioPlaying, onCloseSimli, onCleanupMedia]);

  // When interview completes (after closing), show completed overlay
  useEffect(() => {
    if (isCompleted && !simliClosedRef.current) {
      if (onCloseSimli) {
        console.log('[ActiveScreen] Closing Simli connection (interview completed)');
        onCloseSimli();
        simliClosedRef.current = true;
      }
      if (!showResultsOverlay) {
        setShowCompletedOverlay(true);
      }
    }
  }, [isCompleted, onCloseSimli, showResultsOverlay]);

  // Initialize Simli when ActiveScreen mounts - ONLY for normal flow
  // Reconnect'te Simli init kullanıcı tıklamasından sonra yapılır (AudioContext autoplay policy)
  // Timeout: Simli 10 saniye içinde bağlanamazsa avatar olmadan devam et
  useEffect(() => {
    if (onSimliInit && !simliReady && !simliInitAttempted.current && !isReconnect) {
      simliInitAttempted.current = true;
      console.log('[ActiveScreen] Initializing Simli (normal flow)');
      onSimliInit().then((success) => {
        console.log('[ActiveScreen] Simli init result:', success);
        if (!success && !interviewStarted.current) {
          console.warn('[ActiveScreen] Simli init failed, will start without avatar');
          setSimliTimedOut(true);
        }
      });

      simliTimeoutRef.current = setTimeout(() => {
        if (!interviewStarted.current) {
          console.warn('[ActiveScreen] Simli timeout (10s) - starting interview without avatar');
          setSimliTimedOut(true);
        }
      }, 10000);
    }

    return () => {
      if (simliTimeoutRef.current) {
        clearTimeout(simliTimeoutRef.current);
      }
    };
  }, [onSimliInit, simliReady, isReconnect]);

  // Start interview AFTER Simli is connected OR after Simli timeout
  // Skip if this is a reconnection (session already active) or interview already in progress
  useEffect(() => {
    if (interviewStarted.current) return;
    
    const isAlreadyActive = isReconnect || interviewState !== 'idle';
    const canStart = simliReady || simliTimedOut;
    
    if (canStart && onStartInterview && !isAlreadyActive) {
      interviewStarted.current = true;
      if (simliTimeoutRef.current) {
        clearTimeout(simliTimeoutRef.current);
        simliTimeoutRef.current = null;
      }
      console.log(`[ActiveScreen] Starting interview (simli: ${simliReady ? 'ready' : 'unavailable - fallback mode'})`);
      onStartInterview();
    } else if (isAlreadyActive) {
      interviewStarted.current = true;
      console.log('[ActiveScreen] Interview already active (reconnect or in-progress), skipping interview:start');
    }
  }, [simliReady, simliTimedOut, onStartInterview, isReconnect, interviewState]);

  // Drive initialization overlay steps based on state changes
  useEffect(() => {
    if (initOverlayDismissed.current || !showInitOverlay) return;

    if (simliReady && initStep === 'avatar') {
      setInitStep('questions');
    }
  }, [simliReady, initStep, showInitOverlay]);

  useEffect(() => {
    if (initOverlayDismissed.current || !showInitOverlay) return;

    if (interviewState === 'ai_generating' && (initStep === 'avatar' || initStep === 'questions')) {
      setInitStep('questions');
      const t = setTimeout(() => setInitStep('recording'), 1200);
      return () => clearTimeout(t);
    }

    if (interviewState === 'ai_speaking' && initStep !== 'done' && initStep !== 'ready') {
      setInitStep('ready');
    }
  }, [interviewState, initStep, showInitOverlay]);

  // Dismiss overlay the moment audio actually starts playing
  useEffect(() => {
    if (initOverlayDismissed.current || !showInitOverlay) return;

    if (isAudioPlaying && initStep === 'ready') {
      initOverlayDismissed.current = true;
      setInitStep('done');
      setShowInitOverlay(false);
    }
  }, [isAudioPlaying, initStep, showInitOverlay]);

  // Fallback: if initOverlay is still showing after 20s, dismiss it
  useEffect(() => {
    if (!showInitOverlay) return;
    const t = setTimeout(() => {
      if (!initOverlayDismissed.current) {
        initOverlayDismissed.current = true;
        setInitStep('done');
        setShowInitOverlay(false);
      }
    }, 20000);
    return () => clearTimeout(t);
  }, [showInitOverlay]);

  // Format elapsed time
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedTime = `${minutes} dakika ${seconds} saniye`;

  // Get last AI message's reasoning (for display under avatar)
  const lastAIEntry = [...transcriptEntries].reverse().find(e => e.speaker === 'ai');
  const currentReasoning: string | undefined = undefined;

  // Copy transcript as JSON
  const handleCopyTranscript = () => {
    const transcriptJson = {
      session: {
        sessionId: session?.sessionId,
        candidateName: session?.candidateName,
        assessmentTitle: session?.assessmentTitle,
        totalQuestions: session?.totalQuestions,
        duration: formattedTime,
      },
      entries: transcriptEntries.map((entry) => ({
        speaker: entry.speaker,
        content: entry.content,
        phase: entry.phase,
        timestamp: new Date(entry.timestamp).toISOString(),
      })),
    };

    navigator.clipboard.writeText(JSON.stringify(transcriptJson, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Copy session logs for debugging
  const handleCopyLogs = () => {
    const logsExport = sessionLogger.export();
    navigator.clipboard.writeText(logsExport);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const isTestMode = true;
  const hasCameraStream = !!cameraStream;

  // Compact status config
  const state = interviewState as string;
  const statusConfig = (() => {
    if (isClosing) {
      return isAudioPlaying
        ? { dot: 'bg-blue-500 animate-pulse', text: 'AI Konuşuyor', color: 'text-blue-400', sub: 'Kapanış...' }
        : null;
    }
    if (state === 'ai_generating' || state === 'ai_speaking' || isAudioPlaying) {
      return { dot: 'bg-blue-500 animate-pulse', text: 'AI Konuşuyor', color: 'text-blue-400', sub: state === 'ai_generating' ? 'Düşünüyor...' : '' };
    }
    if (isProcessing && !isAudioPlaying) {
      return { dot: 'border-2 border-yellow-400 border-t-transparent rounded-full animate-spin', text: 'İşleniyor', color: 'text-yellow-400', sub: '' };
    }
    if (isListening && !isProcessing && !isAudioPlaying) {
      return { dot: 'bg-red-500 animate-ping', text: `Dinleniyor ${recordingSeconds}s`, color: 'text-red-400', sub: '' };
    }
    if (state === 'waiting_candidate' && currentTurn === 'candidate' && !isAudioPlaying && !isListening && !isProcessing) {
      return { dot: 'bg-green-500 animate-pulse', text: 'Sıra Sizde', color: 'text-green-400', sub: '' };
    }
    if (state === 'idle' && !isAudioPlaying && !isListening && !isProcessing) {
      return { dot: 'bg-gray-500', text: 'Bekleniyor', color: 'text-gray-400', sub: '' };
    }
    return null;
  })();

  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className="interview-screen h-screen-safe flex flex-col bg-[var(--bg-primary)] relative overflow-hidden">
      {/* Camera Warning */}
      <CameraWarning />

      {/* Header - compact on mobile */}
      <header className="flex items-center justify-between px-3 py-1.5 lg:px-4 lg:py-2 border-b border-[var(--border-default)] flex-shrink-0 pt-safe">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-sm font-semibold text-[var(--text-primary)] whitespace-nowrap">
            AI Interview
          </h1>
          <span className="text-[var(--text-muted)] text-xs hidden md:inline truncate">
            {session?.assessmentTitle}
          </span>
        </div>
        <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">
          {/* Camera integrity - desktop only */}
          {isTestMode && faceDetectionDebugData && faceDetectionDebugData.modelLoaded && (
            <div className="hidden lg:flex items-center gap-2 text-[10px]">
              <span className={faceDetectionDebugData.faceLostCount > 0 ? 'text-red-400' : 'text-green-400/60'}>
                {faceDetectionDebugData.faceLostCount}F
              </span>
              <span className={faceDetectionDebugData.gazeAwayCount > 0 ? 'text-yellow-400' : 'text-green-400/60'}>
                {faceDetectionDebugData.gazeAwayCount}G
              </span>
              <span className={faceDetectionDebugData.multiFaceCount > 0 ? 'text-red-400' : 'text-green-400/60'}>
                {faceDetectionDebugData.multiFaceCount}M
              </span>
            </div>
          )}
          {/* NetworkMetrics - desktop only */}
          <div className="hidden lg:block">
            <NetworkMetricsPanel />
          </div>
          {/* Debug copy - desktop only */}
          <button
            onClick={handleCopyLogs}
            className={`hidden lg:flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              copiedLogs ? 'bg-green-500/20 text-green-400' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
            title="Debug loglarını kopyala"
          >
            {copiedLogs ? <Check className="w-3 h-3" /> : <Bug className="w-3 h-3" />}
          </button>
          <Timer />
          <ConnectionIndicator />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Side: Avatar + Camera */}
        <div className="flex-1 flex flex-col min-h-0 p-2 lg:p-3 gap-1.5 lg:gap-2">
          {/* Video feeds: side-by-side on desktop, avatar full + camera PIP on mobile
              IMPORTANT: Single Avatar & CameraPreview instances - refs must not be duplicated */}
          <div className={`flex-1 min-h-0 relative flex ${hasCameraStream ? 'lg:gap-2' : ''}`}>
            {/* Avatar container */}
            <div className={`${hasCameraStream ? 'w-full lg:flex-1' : 'w-full'} min-h-0 rounded-lg overflow-hidden bg-[var(--bg-secondary)] relative`}>
              <Avatar videoRef={videoRef} audioRef={audioRef} />
              {/* Status pill overlaid on avatar - responsive sizing */}
              {!isCompleted && statusConfig && (
                <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 right-2 sm:right-3 flex justify-center">
                  <div className="flex items-center gap-1.5 px-3 py-1 sm:py-1.5 rounded-full bg-black/60 backdrop-blur-sm">
                    <div className={`w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full ${statusConfig.dot}`} />
                    <span className={`text-xs sm:text-sm font-medium ${statusConfig.color}`}>{statusConfig.text}</span>
                    {statusConfig.sub && <span className="text-white/40 text-[10px] sm:text-xs">{statusConfig.sub}</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Camera Preview - PIP on mobile (small overlay), side-by-side on desktop */}
            {hasCameraStream && (
              <div className="absolute top-2 right-2 w-24 h-32 z-10 rounded-lg overflow-hidden shadow-lg border border-white/10
                              lg:relative lg:inset-auto lg:w-auto lg:h-auto lg:z-auto lg:flex-1 lg:min-h-0 lg:shadow-none lg:border-0">
                <CameraPreview
                  stream={cameraStream ?? null}
                  cameraVideoRef={cameraVideoRef}
                  debugData={faceDetectionDebugData}
                  isTestMode={isTestMode}
                />
              </div>
            )}
          </div>

          {/* Phase Indicator - compact */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex-1">
              <PhaseIndicator />
            </div>
            {currentReasoning && !isCompleted && (
              <div className="hidden lg:flex flex-1 items-center gap-1.5 px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded text-[10px]">
                <Lightbulb className="w-3 h-3 text-purple-400 flex-shrink-0" />
                <p className="text-purple-300 leading-tight line-clamp-1 truncate">
                  {currentReasoning}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Transcript - desktop always visible, mobile as expandable bottom sheet */}
        {/* Desktop transcript */}
        <div className="hidden lg:flex lg:w-[380px] xl:w-[420px] flex-col min-h-0 border-l border-[var(--border-default)] bg-[var(--bg-secondary)]">
          <div className="px-3 py-2 border-b border-[var(--border-default)] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Görüşme Kaydı
            </h2>
            {transcriptEntries.length > 0 && (
              <button
                onClick={handleCopyTranscript}
                className="flex items-center gap-1.5 px-2 py-1 text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] rounded transition-colors"
                title="Transcript'i JSON olarak kopyala"
              >
                {copiedJson ? (
                  <>
                    <Check className="w-3 h-3 text-[var(--success)]" />
                    <span className="text-[var(--success)]">Kopyalandı</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>JSON</span>
                  </>
                )}
              </button>
            )}
          </div>
          <TranscriptPanel />
        </div>

        {/* Mobile transcript bottom sheet */}
        {showTranscript && (
          <div className="lg:hidden fixed inset-0 z-40 flex flex-col">
            <div className="flex-1 bg-black/50" onClick={() => setShowTranscript(false)} />
            <div className="bg-[var(--bg-secondary)] rounded-t-2xl max-h-[60vh] flex flex-col border-t border-[var(--border-default)] shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-default)]">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Görüşme Kaydı ({transcriptEntries.length})
                </h2>
                <button
                  onClick={() => setShowTranscript(false)}
                  className="p-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <TranscriptPanel />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Control Bar + Connection Status combined footer */}
      {!isClosing && !isCompleted && (
        <ControlBar
          onEndCall={() => setShowEndConfirm(true)}
          onMicToggle={isListening ? onStopListening : onStartListening}
          isListening={isListening}
          isProcessing={isProcessing}
          recordingSeconds={recordingSeconds}
          isAiSpeaking={interviewState === 'ai_speaking' || isAudioPlaying}
          isAiGenerating={interviewState === 'ai_generating'}
          currentTurn={currentTurn}
          onToggleTranscript={() => setShowTranscript(!showTranscript)}
          transcriptCount={transcriptEntries.length}
        />
      )}

      {/* Connection status - desktop only, simplified on mobile */}
      <div className="hidden lg:flex justify-center py-1.5 border-t border-[var(--border-default)] bg-[var(--bg-secondary)]">
        <ConnectionStatus />
      </div>

      {/* Initialization Loading Overlay */}
      {showInitOverlay && !isReconnect && (
        <InitOverlay step={initStep} candidateName={session?.candidateName} />
      )}

      {/* Reconnect Resume Overlay */}
      {showReconnectOverlay && !reconnectResumed.current && (
        <div className="absolute inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-t-2xl sm:rounded-xl p-6 sm:p-8 w-full sm:max-w-md sm:mx-4 text-center shadow-2xl border-t sm:border border-[var(--border-default)] pb-safe">
            {reconnectLoading ? (
              <>
                <div className="w-12 h-12 mx-auto mb-4 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
                <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                  Avatar Hazırlanıyor...
                </h2>
                <p className="text-[var(--text-muted)] text-sm">
                  Birkaç saniye sürebilir.
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--accent-primary)]/10 flex items-center justify-center">
                  <CheckCircle className="w-10 h-10 text-[var(--accent-primary)]" />
                </div>

                <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                  Bağlantı Yeniden Kuruldu
                </h2>
                
                <p className="text-[var(--text-secondary)] mb-2">
                  Görüşme bilgileriniz başarıyla yüklendi.
                </p>
                <p className="text-[var(--text-muted)] text-sm mb-6">
                  {transcriptEntries.length > 0
                    ? `${transcriptEntries.length} mesaj geçmişi yüklendi.`
                    : 'Görüşme kaldığınız yerden devam edecek.'}
                </p>

                <button
                  onClick={handleReconnectClick}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors font-medium text-lg active:scale-[0.98]"
                >
                  Görüşmeye Devam Et
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* End Interview Confirmation Overlay */}
      {showEndConfirm && (
        <div className="absolute inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-t-2xl sm:rounded-xl p-6 sm:p-8 w-full sm:max-w-md sm:mx-4 text-center shadow-2xl border-t sm:border border-[var(--border-default)] pb-safe">
            <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-full bg-[var(--error)]/10 flex items-center justify-center">
              <PhoneOff className="w-8 h-8 sm:w-10 sm:h-10 text-[var(--error)]" />
            </div>

            <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] mb-2">
              Görüşmeyi Bitir
            </h2>

            <p className="text-[var(--text-secondary)] text-sm sm:text-base mb-6">
              Görüşme tamamlanmadan çıkmak istediğinize emin misiniz?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 px-4 py-3.5 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] rounded-lg transition-colors font-medium active:scale-[0.98]"
              >
                Vazgeç
              </button>
              <button
                onClick={() => {
                  setShowEndConfirm(false);
                  onEndCall();
                }}
                className="flex-1 px-4 py-3.5 bg-[var(--error)] hover:bg-[var(--error)]/80 text-white rounded-lg transition-colors font-medium active:scale-[0.98]"
              >
                Evet, Bitir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Overlay - shown after closing speech finishes, before full completion */}
      {showResultsOverlay && (
        <div className="absolute inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-t-2xl sm:rounded-xl p-6 sm:p-8 w-full sm:max-w-md sm:mx-4 text-center shadow-2xl border-t sm:border border-[var(--border-default)] pb-safe">
            <ResultsOverlayContent
              session={session}
              formattedTime={formattedTime}
              callbackDebug={callbackDebug}
              onCopyTranscript={handleCopyTranscript}
              copiedJson={copiedJson}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Initialization Overlay ----------

type InitStepType = 'avatar' | 'questions' | 'recording' | 'ready' | 'done';

const INIT_STEPS: { key: InitStepType; icon: React.ElementType; label: string }[] = [
  { key: 'avatar', icon: Radio, label: 'Avatara bağlanıyor...' },
  { key: 'questions', icon: Brain, label: 'Sorularınız hazırlanıyor...' },
  { key: 'recording', icon: Disc3, label: 'Kayıt işlemi başlıyor...' },
  { key: 'ready', icon: Sparkles, label: 'Her şey hazır!' },
];

function InitOverlay({ step, candidateName }: { step: InitStepType; candidateName?: string }) {
  const currentIndex = INIT_STEPS.findIndex(s => s.key === step);
  const isReady = step === 'ready';

  return (
    <div className={`absolute inset-0 z-50 flex items-center justify-center bg-[var(--bg-primary)] transition-opacity duration-500 ${isReady ? 'opacity-90' : 'opacity-100'}`}>
      <div className="flex flex-col items-center gap-8 max-w-sm mx-auto px-6 text-center">
        {/* Logo */}
        <Image
          src="/mavi_logo.png"
          alt="Mavi"
          width={80}
          height={80}
          className="rounded-2xl"
        />

        {/* Greeting */}
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">
            {isReady ? 'Hazırız!' : 'Görüşmeniz Hazırlanıyor'}
          </h2>
          {candidateName && !isReady && (
            <p className="text-[var(--text-secondary)] mt-1 text-sm">
              Lütfen birkaç saniye bekleyin, {candidateName}
            </p>
          )}
        </div>

        {/* Step indicators */}
        <div className="w-full space-y-3">
          {INIT_STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === currentIndex;
            const isDone = i < currentIndex;
            const isPending = i > currentIndex;

            return (
              <div
                key={s.key}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 ${
                  isActive
                    ? 'bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30'
                    : isDone
                      ? 'bg-[var(--success)]/5 border border-[var(--success)]/20'
                      : 'bg-[var(--bg-secondary)] border border-transparent'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isActive
                    ? 'bg-[var(--accent-primary)]/20'
                    : isDone
                      ? 'bg-[var(--success)]/10'
                      : 'bg-[var(--bg-tertiary)]'
                }`}>
                  {isDone ? (
                    <Check className="w-4 h-4 text-[var(--success)]" />
                  ) : isActive ? (
                    <Icon className="w-4 h-4 text-[var(--accent-primary)] animate-pulse" />
                  ) : (
                    <Icon className={`w-4 h-4 ${isPending ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}`} />
                  )}
                </div>
                <span className={`text-sm font-medium ${
                  isActive
                    ? 'text-[var(--accent-primary)]'
                    : isDone
                      ? 'text-[var(--success)]'
                      : 'text-[var(--text-muted)]'
                }`}>
                  {isDone ? s.label.replace('...', '') + ' \u2713' : s.label}
                </span>
                {isActive && (
                  <Loader2 className="w-4 h-4 text-[var(--accent-primary)] animate-spin ml-auto flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--success)] rounded-full transition-all duration-700 ease-out"
            style={{ width: `${((currentIndex + 1) / INIT_STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- Results Overlay Content ----------

function ResultsOverlayContent({
  session,
  formattedTime,
  callbackDebug,
  onCopyTranscript,
  copiedJson,
}: {
  session: { candidateName: string; assessmentTitle: string; totalQuestions: number } | null;
  formattedTime: string;
  callbackDebug: CallbackDebugInfo | null;
  onCopyTranscript: () => void;
  copiedJson: boolean;
}) {
  const hasCallback = callbackDebug !== null;
  const callbackSuccess = callbackDebug?.success ?? false;

  return (
    <>
      {/* Icon */}
      <div className="w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center"
        style={{ background: hasCallback ? (callbackSuccess ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)') : 'rgba(59,130,246,0.1)' }}
      >
        {hasCallback ? (
          callbackSuccess ? (
            <CheckCircle className="w-9 h-9 text-emerald-400" />
          ) : (
            <X className="w-9 h-9 text-red-400" />
          )
        ) : (
          <Loader2 className="w-9 h-9 text-blue-400 animate-spin" />
        )}
      </div>

      {/* Title */}
      <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
        {hasCallback
          ? (callbackSuccess ? 'Görüşme Tamamlandı' : 'Sonuçlar Gönderilemedi')
          : 'Görüşme Sonlandırılıyor...'}
      </h2>

      {/* Subtitle */}
      <p className="text-[var(--text-secondary)] text-sm mb-5">
        {hasCallback
          ? (callbackSuccess
              ? `Zaman ayırdığınız için teşekkür ederiz${session?.candidateName ? `, ${session.candidateName}` : ''}.`
              : 'Sonuçlar gönderilirken bir hata oluştu. Lütfen yöneticinize bildirin.')
          : 'Sonuçlarınız gönderiliyor, lütfen bu sayfayı kapatmayın...'}
      </p>

      {/* Stats */}
      <div className="bg-[var(--bg-tertiary)] rounded-lg p-4 mb-4 text-left">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[var(--text-muted)]">Değerlendirme</p>
            <p className="text-[var(--text-primary)] font-medium text-xs sm:text-sm">{session?.assessmentTitle || '-'}</p>
          </div>
          <div>
            <p className="text-[var(--text-muted)]">Toplam Soru</p>
            <p className="text-[var(--text-primary)] font-medium">{session?.totalQuestions || '-'}</p>
          </div>
          <div className="col-span-2">
            <p className="text-[var(--text-muted)]">Görüşme Süresi</p>
            <p className="text-[var(--text-primary)] font-medium">{formattedTime}</p>
          </div>
        </div>
      </div>

      {/* Callback status indicator */}
      {hasCallback ? (
        <div className={`rounded-lg p-3 mb-5 text-left text-xs border ${
          callbackSuccess ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
        }`}>
          <div className="flex items-center gap-2">
            {callbackSuccess ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <X className="w-4 h-4 text-red-400 flex-shrink-0" />
            )}
            <span className={callbackSuccess ? 'text-emerald-400' : 'text-red-400'}>
              Sonuçlar {callbackSuccess ? 'başarıyla gönderildi' : 'gönderilemedi'}
              {callbackDebug?.responseStatus ? ` (${callbackDebug.responseStatus})` : ''}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg p-3 mb-5 text-left text-xs border bg-blue-500/5 border-blue-500/20">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
            <span className="text-blue-400">Sonuçlar gönderiliyor...</span>
          </div>
        </div>
      )}

      {/* Copy transcript button - only when callback received */}
      {hasCallback && (
        <button
          onClick={onCopyTranscript}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors mb-3 active:scale-[0.98]"
        >
          {copiedJson ? (
            <>
              <Check className="w-5 h-5" />
              <span>Transcript Kopyalandı!</span>
            </>
          ) : (
            <>
              <Copy className="w-5 h-5" />
              <span>Transcript&apos;i JSON Olarak Kopyala</span>
            </>
          )}
        </button>
      )}

      {/* Warning to not close */}
      {!hasCallback && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
          <Loader2 className="w-4 h-4 text-amber-400 animate-spin flex-shrink-0" />
          <p className="text-amber-300/90 text-xs leading-relaxed">
            Lütfen bu sayfayı kapatmayın, sonuçlarınız iletiliyor...
          </p>
        </div>
      )}

      {hasCallback && (
        <p className="text-[var(--text-muted)] text-xs mt-2">
          Bu pencereyi artık kapatabilirsiniz.
        </p>
      )}
    </>
  );
}

// ---------- Completed Overlay Content ----------

function CompletedOverlayContent({
  session,
  formattedTime,
  callbackDebug,
  onClose,
  onCopyTranscript,
  copiedJson,
}: {
  session: { candidateName: string; assessmentTitle: string; totalQuestions: number } | null;
  formattedTime: string;
  callbackDebug: CallbackDebugInfo | null;
  onClose: () => void;
  onCopyTranscript: () => void;
  copiedJson: boolean;
}) {
  return (
    <>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        title="Kapat"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-full bg-[var(--success)]/10 flex items-center justify-center">
        <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10 text-[var(--success)]" />
      </div>

      <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] mb-2">
        Görüşme Tamamlandı
      </h2>

      <p className="text-[var(--text-secondary)] text-sm sm:text-base mb-4">
        Zaman ayırdığınız için teşekkür ederiz
        {session?.candidateName ? `, ${session.candidateName}` : ''}.
      </p>

      <div className="bg-[var(--bg-tertiary)] rounded-lg p-4 mb-4 text-left">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[var(--text-muted)]">Değerlendirme</p>
            <p className="text-[var(--text-primary)] font-medium text-xs sm:text-sm">
              {session?.assessmentTitle || '-'}
            </p>
          </div>
          <div>
            <p className="text-[var(--text-muted)]">Toplam Soru</p>
            <p className="text-[var(--text-primary)] font-medium">
              {session?.totalQuestions || '-'}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-[var(--text-muted)]">Görüşme Süresi</p>
            <p className="text-[var(--text-primary)] font-medium">
              {formattedTime}
            </p>
          </div>
        </div>
      </div>

      {/* Callback status — non-blocking inline indicator */}
      {callbackDebug ? (
        <div className={`rounded-lg p-3 mb-4 text-left text-xs border ${
          callbackDebug.success
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : 'bg-red-500/5 border-red-500/20'
        }`}>
          <div className="flex items-center gap-2">
            {callbackDebug.success ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <X className="w-4 h-4 text-red-400 flex-shrink-0" />
            )}
            <span className={callbackDebug.success ? 'text-emerald-400' : 'text-red-400'}>
              Sonuçlar {callbackDebug.success ? 'başarıyla gönderildi' : 'gönderilemedi'}
              {callbackDebug.responseStatus && ` (${callbackDebug.responseStatus})`}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg p-3 mb-4 text-left text-xs border bg-blue-500/5 border-blue-500/20">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
            <span className="text-blue-400">
              Sonuçlar gönderiliyor...
            </span>
          </div>
        </div>
      )}

      <button
        onClick={onCopyTranscript}
        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors mb-3 active:scale-[0.98]"
      >
        {copiedJson ? (
          <>
            <Check className="w-5 h-5" />
            <span>Transcript Kopyalandı!</span>
          </>
        ) : (
          <>
            <Copy className="w-5 h-5" />
            <span>Transcript&apos;i JSON Olarak Kopyala</span>
          </>
        )}
      </button>

      <p className="text-[var(--text-muted)] text-xs">
        Bu pencereyi artık kapatabilirsiniz.
      </p>
    </>
  );
}
