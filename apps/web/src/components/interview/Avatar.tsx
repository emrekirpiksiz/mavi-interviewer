'use client';

import { useInterviewStore } from '@/stores/interviewStore';
import { User, Loader2 } from 'lucide-react';

// ============================================
// AVATAR COMPONENT
// ============================================
// Simli avatar wrapper with fallback

interface AvatarProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export function Avatar({ videoRef, audioRef }: AvatarProps) {
  const simliReady = useInterviewStore((state) => state.simliReady);
  const pageState = useInterviewStore((state) => state.pageState);
  const interviewState = useInterviewStore((state) => state.interviewState);
  
  // Loading only while Simli is initializing AND interview hasn't started yet
  const interviewActive = interviewState !== 'idle';
  const isLoading = pageState === 'active' && !simliReady && !interviewActive;

  return (
    <div className="relative w-full h-full">
      {/* Simli Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`
          w-full h-full object-cover
          ${simliReady ? 'opacity-100' : 'opacity-0'}
        `}
      />

      {/* Simli Audio (hidden) */}
      <audio ref={audioRef} autoPlay className="hidden" />

      {/* Loading State (when initializing Simli) */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-tertiary)]">
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-[var(--accent-primary)]/20 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-12 h-12 text-[var(--accent-primary)] animate-spin" />
            </div>
            <p className="text-[var(--text-secondary)] text-sm">
              Avatar hazırlanıyor...
            </p>
          </div>
        </div>
      )}

      {/* Fallback Avatar (when Simli failed or not active) */}
      {!simliReady && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-tertiary)]">
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-[var(--accent-primary)]/20 flex items-center justify-center mx-auto mb-4">
              <User className="w-12 h-12 text-[var(--accent-primary)]" />
            </div>
            <p className="text-[var(--text-secondary)] text-sm">
              AI Interviewer
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
