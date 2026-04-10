'use client';

import { useEffect, useRef } from 'react';
import { useInterviewStore } from '@/stores/interviewStore';
import { Camera, CameraOff, Eye, EyeOff, UserCheck } from 'lucide-react';
import type { FaceDetectionDebugData } from '@/hooks/useFaceDetection';

// ============================================
// CAMERA PREVIEW COMPONENT
// ============================================
// Displays the candidate's camera feed in the same size as Avatar.
// Shows face/gaze status indicators and fallback UI.
// In test mode, shows a debug overlay with real-time detection data.

interface CameraPreviewProps {
  stream: MediaStream | null;
  cameraVideoRef?: React.RefObject<HTMLVideoElement | null>;
  debugData?: FaceDetectionDebugData | null;
  isTestMode?: boolean;
}

export function CameraPreview({ stream, cameraVideoRef, debugData, isTestMode }: CameraPreviewProps) {
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = cameraVideoRef || internalRef;

  const cameraEnabled = useInterviewStore((s) => s.cameraEnabled);
  const cameraPermission = useInterviewStore((s) => s.cameraPermission);
  const faceDetected = useInterviewStore((s) => s.faceDetected);
  const gazeOnCamera = useInterviewStore((s) => s.gazeOnCamera);

  useEffect(() => {
    const el = videoRef.current;
    if (el && stream) {
      el.srcObject = stream;
    }
    return () => {
      if (el) el.srcObject = null;
    };
  }, [stream, videoRef]);

  if (!cameraEnabled) return null;

  const hasStream = stream && cameraPermission === 'granted';

  const statusColor = !hasStream
    ? 'bg-gray-500'
    : !faceDetected
      ? 'bg-red-500'
      : !gazeOnCamera
        ? 'bg-yellow-500'
        : 'bg-green-500';

  const StatusIcon = !hasStream
    ? CameraOff
    : !faceDetected
      ? EyeOff
      : !gazeOnCamera
        ? Eye
        : UserCheck;

  const statusLabel = !hasStream
    ? 'Kapalı'
    : !faceDetected
      ? 'Yüz yok'
      : !gazeOnCamera
        ? 'Bakış dışı'
        : 'OK';

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden bg-[var(--bg-tertiary)]">
      {hasStream ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
          {/* Status badge */}
          <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-2.5 py-1">
            <div className={`w-2.5 h-2.5 rounded-full ${statusColor} ${!faceDetected || !gazeOnCamera ? 'animate-pulse' : ''}`} />
            <StatusIcon className="w-3.5 h-3.5 text-white/90" />
            <span className="text-[10px] text-white/70 font-medium">{statusLabel}</span>
          </div>

          {/* Test mode debug overlay */}
          {isTestMode && debugData && (
            <FaceDetectionDebugOverlay data={debugData} />
          )}
        </>
      ) : (
        <div className="w-full h-full min-h-[120px] flex items-center justify-center">
          <div className="text-center">
            <CameraOff className="w-8 h-8 text-[var(--text-secondary)] mx-auto mb-2" />
            <p className="text-[var(--text-secondary)] text-xs">
              {cameraPermission === 'denied' ? 'Kamera izni reddedildi' : 'Kamera kapalı'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function FaceDetectionDebugOverlay({ data }: { data: FaceDetectionDebugData }) {
  const irisDisplay = data.gazeRatio !== null ? data.gazeRatio.toFixed(3) : '—';
  const yawDisplay = data.headYaw !== null ? data.headYaw.toFixed(3) : '—';
  const faceLostMs = data.faceLostElapsedMs !== null ? `${(data.faceLostElapsedMs / 1000).toFixed(1)}s` : '—';
  const gazeAwayMs = data.gazeAwayElapsedMs !== null ? `${(data.gazeAwayElapsedMs / 1000).toFixed(1)}s` : '—';

  const irisBar = data.gazeRatio !== null ? Math.max(0, Math.min(1, data.gazeRatio)) * 100 : 50;
  const irisInRange = data.gazeRatio !== null && data.gazeRatio >= 0.4 && data.gazeRatio <= 0.6;

  const yawBar = data.headYaw !== null ? (data.headYaw + 1) / 2 * 100 : 50;
  const yawOk = data.headYaw !== null && Math.abs(data.headYaw) <= 0.5;

  return (
    <div className="hidden lg:block absolute top-0 left-0 right-0 bg-black/75 backdrop-blur-sm text-[10px] font-mono text-white/90 p-2 space-y-1">
      {/* Row 1: state + FPS */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={data.faceCount === 0 ? 'text-red-400' : data.faceCount > 1 ? 'text-orange-400' : 'text-green-400'}>
            FACE: {data.faceCount}{data.faceCount > 1 ? ' ⚠' : ''}
          </span>
          <span className={data.isLookingAtCamera ? 'text-green-400' : 'text-yellow-400'}>
            GAZE: {data.isLookingAtCamera ? 'ON' : 'OFF'}
          </span>
        </div>
        <span className="text-white/50">{data.fps.toFixed(0)} FPS</span>
      </div>

      {/* Row 2: iris ratio bar */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-white/60">Iris</span>
          <span className={data.gazeRatio === null ? 'text-white/30' : irisInRange ? 'text-green-400' : 'text-yellow-400'}>{irisDisplay}</span>
        </div>
        <div className="relative h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="absolute h-full bg-green-500/20 rounded-full" style={{ left: '40%', width: '20%' }} />
          {data.gazeRatio !== null && (
            <div
              className={`absolute top-0 h-full w-1 rounded-full ${irisInRange ? 'bg-green-400' : 'bg-yellow-400'}`}
              style={{ left: `${irisBar}%`, transform: 'translateX(-50%)' }}
            />
          )}
        </div>
      </div>

      {/* Row 3: head yaw bar */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-white/60">Head yaw</span>
          <span className={data.headYaw === null ? 'text-white/30' : yawOk ? 'text-green-400' : 'text-yellow-400'}>{yawDisplay}</span>
        </div>
        <div className="relative h-1 bg-white/10 rounded-full overflow-hidden">
          {/* Center zone: ±0.5 → mapped to bar: 25% to 75% */}
          <div className="absolute h-full bg-green-500/20 rounded-full" style={{ left: '25%', width: '50%' }} />
          {data.headYaw !== null && (
            <div
              className={`absolute top-0 h-full w-1 rounded-full ${yawOk ? 'bg-green-400' : 'bg-yellow-400'}`}
              style={{ left: `${yawBar}%`, transform: 'translateX(-50%)' }}
            />
          )}
        </div>
        <div className="flex justify-between text-[8px] text-white/30 mt-0.5">
          <span>L</span>
          <span>0</span>
          <span>R</span>
        </div>
      </div>

      {/* Row 4: threshold timers */}
      <div className="flex items-center gap-3">
        <span className="text-white/60">
          Face: <span className={data.faceLostElapsedMs !== null ? 'text-red-400' : 'text-white/40'}>{faceLostMs}</span>
          <span className="text-white/30">/5s</span>
        </span>
        <span className="text-white/60">
          Gaze: <span className={data.gazeAwayElapsedMs !== null ? 'text-yellow-400' : 'text-white/40'}>{gazeAwayMs}</span>
          <span className="text-white/30">/5s</span>
        </span>
        <span className="text-white/60 ml-auto">
          <span className={data.faceLostCount > 0 ? 'text-red-400' : 'text-white/40'}>{data.faceLostCount}F</span>
          {' '}
          <span className={data.gazeAwayCount > 0 ? 'text-yellow-400' : 'text-white/40'}>{data.gazeAwayCount}G</span>
          {' '}
          <span className={data.multiFaceCount > 0 ? 'text-red-400' : 'text-white/40'}>{data.multiFaceCount}M</span>
        </span>
      </div>
    </div>
  );
}
