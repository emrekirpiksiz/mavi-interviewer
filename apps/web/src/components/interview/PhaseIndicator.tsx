'use client';

import { useInterviewStore } from '@/stores/interviewStore';
import type { AssessmentPhase } from '@ai-interview/shared';

// ============================================
// PHASE INDICATOR - QUESTION PROGRESS
// ============================================

const PHASE_LABELS: Record<AssessmentPhase, string> = {
  introduction: 'Giriş',
  assessment: 'Değerlendirme',
  closing: 'Kapanış',
};

export function PhaseIndicator() {
  const currentPhase = useInterviewStore((state) => state.currentPhase);
  const session = useInterviewStore((state) => state.session);
  
  const totalQuestions = session?.totalQuestions ?? 0;
  const currentIndex = session?.currentQuestionIndex ?? 0;

  if (currentPhase === 'introduction' || currentPhase === 'closing') {
    return (
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center">
          <span className="text-sm text-[var(--text-secondary)] font-medium">
            {PHASE_LABELS[currentPhase]}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      {/* Desktop View */}
      <div className="hidden sm:flex items-center justify-center gap-3">
        <span className="text-sm text-[var(--text-secondary)]">
          {PHASE_LABELS[currentPhase]}
        </span>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalQuestions }, (_, i) => {
            const status = i < currentIndex ? 'completed' : i === currentIndex ? 'current' : 'pending';
            return (
              <div
                key={i}
                className={`
                  w-2.5 h-2.5 rounded-full transition-all
                  ${status === 'completed' 
                    ? 'bg-[var(--success)]' 
                    : status === 'current'
                      ? 'bg-[var(--accent-primary)] ring-3 ring-[var(--accent-primary)]/30 animate-pulse'
                      : 'bg-[var(--border-default)]'
                  }
                `}
                title={`Soru ${i + 1}`}
              />
            );
          })}
        </div>
        <span className="text-xs text-[var(--text-muted)]">
          {currentIndex}/{totalQuestions}
        </span>
      </div>

      {/* Mobile View */}
      <div className="flex sm:hidden items-center justify-center gap-2">
        <span className="text-xs text-[var(--text-secondary)]">
          Soru {currentIndex}/{totalQuestions}
        </span>
        <div className="flex items-center gap-1">
          {Array.from({ length: totalQuestions }, (_, i) => {
            const status = i < currentIndex ? 'completed' : i === currentIndex ? 'current' : 'pending';
            return (
              <div
                key={i}
                className={`
                  w-2 h-2 rounded-full transition-all
                  ${status === 'completed' 
                    ? 'bg-[var(--success)]' 
                    : status === 'current'
                      ? 'bg-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/30 animate-pulse'
                      : 'bg-[var(--border-default)]'
                  }
                `}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
