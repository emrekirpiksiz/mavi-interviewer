'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useInterviewStore } from '@/stores/interviewStore';
import { useInterview } from '@/hooks/useInterview';
import { LoadingScreen } from '@/components/interview/LoadingScreen';
import { ReadyScreen } from '@/components/interview/ReadyScreen';
import { ActiveScreen } from '@/components/interview/ActiveScreen';
import { CompletedScreen } from '@/components/interview/CompletedScreen';
import { ErrorScreen } from '@/components/interview/ErrorScreen';
import { ReconnectingScreen } from '@/components/interview/ReconnectingScreen';
import { TakenOverScreen } from '@/components/interview/TakenOverScreen';
import { UnsupportedBrowserScreen } from '@/components/interview/UnsupportedBrowserScreen';
import { checkBrowserCompatibility, type BrowserCheckResult } from '@/lib/browserCheck';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:2223';

export default function InterviewPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  // Browser compatibility check
  const [browserCheck, setBrowserCheck] = useState<BrowserCheckResult | null>(null);

  useEffect(() => {
    setBrowserCheck(checkBrowserCompatibility());
  }, []);

  // Video and audio refs for Simli avatar
  const videoRef = useRef<HTMLVideoElement>(null!);
  const audioRef = useRef<HTMLAudioElement>(null!);

  // Store state
  const pageState = useInterviewStore((state) => state.pageState);
  const error = useInterviewStore((state) => state.error);
  const reset = useInterviewStore((state) => state.reset);
  const setPageState = useInterviewStore((state) => state.setPageState);
  const setSession = useInterviewStore((state) => state.setSession);

  // Track whether the session was ever active in this page lifecycle
  const wasActiveRef = useRef(false);

  // Interview hook
  const interview = useInterview({ videoRef, audioRef });

  // Track active state
  useEffect(() => {
    if (pageState === 'active' || pageState === 'closing') {
      wasActiveRef.current = true;
    }
  }, [pageState]);

  // Connect on mount - check session status first for reconnect detection
  useEffect(() => {
    if (!sessionId) return;

    async function init() {
      reset();

      try {
        // Check session status before connecting
        const response = await fetch(`${API_URL}/sessions/${sessionId}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setPageState('error');
            useInterviewStore.getState().setError('Görüşme bulunamadı');
            return;
          }
          interview.connect(sessionId);
          return;
        }

        const data = await response.json();
        const status = data?.data?.status;

        if (status === 'active') {
          console.log('[InterviewPage] Active session detected, starting reconnect flow');
          setPageState('reconnecting');
          interview.connect(sessionId);
        } else if (status === 'completed') {
          // Load session info from API response for CompletedScreen
          setSession({
            sessionId,
            candidateName: data?.data?.candidate?.name || '',
            assessmentTitle: data?.data?.assessment?.title || '',
            totalQuestions: 0,
            status: 'completed',
            currentPhase: 'closing',
            currentQuestionIndex: 0,
          });
          setPageState('completed');
        } else if (status === 'failed') {
          setPageState('error');
          useInterviewStore.getState().setError('Bu görüşme başarısız olarak sonlandırılmış');
        } else {
          interview.connect(sessionId);
        }
      } catch (err) {
        console.error('[InterviewPage] Error checking session:', err);
        interview.connect(sessionId);
      }
    }

    init();

    return () => {
      interview.disconnect();
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle takeover reconnect
  const handleTakeoverReconnect = () => {
    reset();
    setPageState('reconnecting');
    interview.connect(sessionId);
  };

  // Render based on page state
  const renderContent = () => {
    switch (pageState) {
      case 'loading':
        return <LoadingScreen />;
      
      case 'reconnecting':
        return <ReconnectingScreen />;
      
      case 'taken_over':
        return <TakenOverScreen onReconnect={handleTakeoverReconnect} />;
      
      case 'setup':
      case 'ready':
        return (
          <ReadyScreen
            onStart={interview.startInterview}
            onMicPermissionRequest={interview.requestMicPermission}
            onCameraPermissionRequest={interview.requestCameraPermission}
          />
        );
      
      case 'completed':
        // Direct visit to a completed session -> show standalone CompletedScreen
        // Session that just finished (was active) -> show ActiveScreen with results overlay
        if (!wasActiveRef.current) {
          return <CompletedScreen />;
        }
        // fall through to ActiveScreen
      // eslint-disable-next-line no-fallthrough
      case 'active':
      case 'closing':
        return (
          <ActiveScreen
            videoRef={videoRef}
            audioRef={audioRef}
            onEndCall={() => interview.endInterview('candidate_left')}
            onStartListening={interview.startListening}
            onStopListening={interview.stopListening}
            isListening={interview.isListening}
            isProcessing={interview.isProcessing}
            recordingSeconds={interview.recordingSeconds}
            isAudioPlaying={interview.isAudioPlaying}
            onSimliInit={interview.initializeSimli}
            onStartInterview={interview.startInterview}
            isClosing={pageState === 'closing'}
            isCompleted={pageState === 'completed'}
            onCloseSimli={interview.closeSimli}
            onCleanupMedia={interview.cleanupMedia}
            onResumeAfterReconnect={interview.resumeAfterReconnect}
            cameraStream={interview.cameraStream}
            cameraVideoRef={interview.cameraVideoRef}
            faceDetectionDebugData={interview.faceDetectionDebugData}
          />
        );
      
      case 'error':
        return (
          <ErrorScreen
            error={error || 'Bilinmeyen bir hata oluştu'}
            onRetry={() => {
              reset();
              interview.connect(sessionId);
            }}
          />
        );
      
      default:
        return <LoadingScreen />;
    }
  };

  if (browserCheck && !browserCheck.isSupported) {
    return <UnsupportedBrowserScreen browserCheck={browserCheck} />;
  }

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] overflow-x-hidden">
      {renderContent()}
    </main>
  );
}
