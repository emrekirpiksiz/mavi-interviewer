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
import { CheckCircle, Copy, Check, X, Lightbulb, Bug, PhoneOff } from 'lucide-react';
import { useState } from 'react';
import { sessionLogger } from '@/lib/sessionLogger';

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
  isCompleted?: boolean;
  onCloseSimli?: () => void;
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
  isCompleted = false,
  onCloseSimli,
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
  const reconnectResumed = useRef(false);

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

  // Timer interval - pause when completed
  useEffect(() => {
    if (isCompleted) return;
    
    const interval = setInterval(() => {
      tick();
    }, 1000);

    return () => clearInterval(interval);
  }, [tick, isCompleted]);

  // When interview completes, show overlay and close Simli
  useEffect(() => {
    if (isCompleted && !simliClosedRef.current) {
      setShowCompletedOverlay(true);
      
      // Close Simli to stop usage billing
      if (onCloseSimli) {
        console.log('[ActiveScreen] Closing Simli connection (interview completed)');
        onCloseSimli();
        simliClosedRef.current = true;
      }
    }
  }, [isCompleted, onCloseSimli]);

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

  // Format elapsed time
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedTime = `${minutes} dakika ${seconds} saniye`;

  // Get last AI message's reasoning (for display under avatar)
  const lastAIEntry = [...transcriptEntries].reverse().find(e => e.speaker === 'ai');
  const currentReasoning = lastAIEntry?.reasoning;

  // Copy transcript as JSON
  const handleCopyTranscript = () => {
    const transcriptJson = {
      session: {
        sessionId: session?.sessionId,
        candidateName: session?.candidateName,
        positionTitle: session?.positionTitle,
        companyName: session?.companyName,
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

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)] relative overflow-hidden">
      {/* Camera Warning */}
      <CameraWarning />

      {/* Turn change info is shown via the status pill on the avatar */}

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-[var(--text-primary)]">
            AI Interview
          </h1>
          <span className="text-[var(--text-muted)] text-xs hidden sm:inline">
            {session?.companyName} - {session?.positionTitle}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Camera integrity summary in header (test mode) */}
          {isTestMode && faceDetectionDebugData && faceDetectionDebugData.modelLoaded && (
            <div className="hidden sm:flex items-center gap-2 text-[10px]">
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
          <NetworkMetricsPanel />
          <button
            onClick={handleCopyLogs}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
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
        {/* Left Side: Avatar + Camera side by side */}
        <div className="lg:flex-1 flex flex-col min-h-0 p-3 gap-2">
          {/* Video feeds row: avatar and camera side-by-side when both present */}
          <div className={`flex-1 min-h-0 flex ${hasCameraStream ? 'gap-2' : ''}`}>
            {/* Avatar */}
            <div className={`${hasCameraStream ? 'flex-1' : 'w-full'} min-h-0 rounded-lg overflow-hidden bg-[var(--bg-secondary)] relative`}>
              <Avatar videoRef={videoRef} audioRef={audioRef} />
              {/* Status pill overlaid on avatar */}
              {!isCompleted && statusConfig && (
                <div className="absolute bottom-2 left-2 right-2 flex justify-center">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-sm">
                    <div className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                    <span className={`text-xs font-medium ${statusConfig.color}`}>{statusConfig.text}</span>
                    {statusConfig.sub && <span className="text-white/40 text-[10px]">{statusConfig.sub}</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Camera Preview (same height as avatar, side by side) */}
            {hasCameraStream && (
              <div className="flex-1 min-h-0 rounded-lg overflow-hidden">
                <CameraPreview
                  stream={cameraStream ?? null}
                  cameraVideoRef={cameraVideoRef}
                  debugData={faceDetectionDebugData}
                  isTestMode={isTestMode}
                />
              </div>
            )}
          </div>

          {/* Phase Indicator + Reasoning (compact row) */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <PhaseIndicator />
            </div>
            {currentReasoning && !isCompleted && (
              <div className="flex-1 flex items-center gap-1.5 px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded text-[10px]">
                <Lightbulb className="w-3 h-3 text-purple-400 flex-shrink-0" />
                <p className="text-purple-300 leading-tight line-clamp-1 truncate">
                  {currentReasoning}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Transcript */}
        <div className="lg:w-[380px] xl:w-[420px] flex flex-col min-h-0 border-t lg:border-t-0 lg:border-l border-[var(--border-default)] bg-[var(--bg-secondary)]">
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
      </main>

      {/* Control Bar + Connection Status combined footer */}
      {!isCompleted && (
        <ControlBar
          onEndCall={() => setShowEndConfirm(true)}
          onMicToggle={isListening ? onStopListening : onStartListening}
          isListening={isListening}
          isProcessing={isProcessing}
          recordingSeconds={recordingSeconds}
          isAiSpeaking={interviewState === 'ai_speaking' || isAudioPlaying}
          isAiGenerating={interviewState === 'ai_generating'}
          currentTurn={currentTurn}
        />
      )}

      <div className="flex justify-center py-1.5 border-t border-[var(--border-default)] bg-[var(--bg-secondary)]">
        <ConnectionStatus />
      </div>

      {/* Reconnect Resume Overlay */}
      {showReconnectOverlay && !reconnectResumed.current && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-xl p-8 max-w-md mx-4 text-center shadow-2xl border border-[var(--border-default)]">
            {reconnectLoading ? (
              <>
                {/* Loading State - Simli initializing after click */}
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
                {/* Ready State - Waiting for user click */}
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
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors font-medium text-lg"
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
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-xl p-8 max-w-md mx-4 text-center shadow-2xl border border-[var(--border-default)]">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--error)]/10 flex items-center justify-center">
              <PhoneOff className="w-10 h-10 text-[var(--error)]" />
            </div>

            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
              Görüşmeyi Bitir
            </h2>

            <p className="text-[var(--text-secondary)] mb-6">
              Görüşme tamamlanmadan çıkmak istediğinize emin misiniz?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 px-4 py-3 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] rounded-lg transition-colors font-medium"
              >
                Vazgeç
              </button>
              <button
                onClick={() => {
                  setShowEndConfirm(false);
                  onEndCall();
                }}
                className="flex-1 px-4 py-3 bg-[var(--error)] hover:bg-[var(--error)]/80 text-white rounded-lg transition-colors font-medium"
              >
                Evet, Bitir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completed Overlay */}
      {showCompletedOverlay && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-xl p-8 max-w-md mx-4 text-center shadow-2xl border border-[var(--border-default)] relative">
            {/* Close Button */}
            <button
              onClick={() => setShowCompletedOverlay(false)}
              className="absolute top-4 right-4 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="Kapat"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Success Icon */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--success)]/10 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-[var(--success)]" />
            </div>

            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
              Görüşme Tamamlandı
            </h2>
            
            <p className="text-[var(--text-secondary)] mb-4">
              Zaman ayırdığınız için teşekkür ederiz
              {session?.candidateName ? `, ${session.candidateName}` : ''}.
            </p>

            {/* Stats */}
            <div className="bg-[var(--bg-tertiary)] rounded-lg p-4 mb-4 text-left">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[var(--text-muted)]">Şirket</p>
                  <p className="text-[var(--text-primary)] font-medium">
                    {session?.companyName || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-[var(--text-muted)]">Pozisyon</p>
                  <p className="text-[var(--text-primary)] font-medium">
                    {session?.positionTitle || '-'}
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

            {/* Copy Transcript Button */}
            <button
              onClick={handleCopyTranscript}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors mb-3"
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
              Network metriklerini ve transcript&apos;i arka planda inceleyebilirsiniz.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
