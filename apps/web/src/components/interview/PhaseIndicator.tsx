'use client';

import { useInterviewStore } from '@/stores/interviewStore';
import type { InterviewPhase } from '@ai-interview/shared';

// ============================================
// PHASE INDICATOR
// ============================================
// Shows progress through interview phases

const PHASES: { id: InterviewPhase; label: string }[] = [
  { id: 'introduction', label: 'Giriş' },
  { id: 'experience', label: 'Deneyim' },
  { id: 'technical', label: 'Teknik' },
  { id: 'behavioral', label: 'Davranış' },
  { id: 'motivation', label: 'Motivasyon' },
  { id: 'closing', label: 'Kapanış' },
];

export function PhaseIndicator() {
  const currentPhase = useInterviewStore((state) => state.currentPhase);
  const config = useInterviewStore((state) => state.config);

  // Use config phases if available, otherwise use all phases
  const phases = config?.phases || PHASES.map(p => p.id);

  const getPhaseStatus = (phaseId: InterviewPhase): 'completed' | 'current' | 'pending' => {
    const currentIndex = phases.indexOf(currentPhase);
    const phaseIndex = phases.indexOf(phaseId);

    if (phaseIndex < currentIndex) return 'completed';
    if (phaseIndex === currentIndex) return 'current';
    return 'pending';
  };

  return (
    <div className="w-full max-w-md">
      {/* Desktop View */}
      <div className="hidden sm:flex items-center justify-between">
        {PHASES.filter(p => phases.includes(p.id)).map((phase, index) => {
          const status = getPhaseStatus(phase.id);
          return (
            <div key={phase.id} className="flex items-center">
              {/* Phase Dot */}
              <div className="flex flex-col items-center">
                <div
                  className={`
                    w-3 h-3 rounded-full transition-all
                    ${status === 'completed' 
                      ? 'bg-[var(--success)]' 
                      : status === 'current'
                        ? 'bg-[var(--accent-primary)] ring-4 ring-[var(--accent-primary)]/30 animate-pulse'
                        : 'bg-[var(--border-default)]'
                    }
                  `}
                />
                <span
                  className={`
                    text-xs mt-1 whitespace-nowrap
                    ${status === 'current' 
                      ? 'text-[var(--accent-primary)] font-medium' 
                      : 'text-[var(--text-muted)]'
                    }
                  `}
                >
                  {phase.label}
                </span>
              </div>

              {/* Connector Line */}
              {index < PHASES.filter(p => phases.includes(p.id)).length - 1 && (
                <div
                  className={`
                    flex-1 h-0.5 mx-2 min-w-[20px]
                    ${status === 'completed' 
                      ? 'bg-[var(--success)]' 
                      : 'bg-[var(--border-default)]'
                    }
                  `}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile View (dots only) */}
      <div className="flex sm:hidden items-center justify-center gap-2">
        {PHASES.filter(p => phases.includes(p.id)).map((phase) => {
          const status = getPhaseStatus(phase.id);
          return (
            <div
              key={phase.id}
              className={`
                w-2 h-2 rounded-full transition-all
                ${status === 'completed' 
                  ? 'bg-[var(--success)]' 
                  : status === 'current'
                    ? 'bg-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/30 animate-pulse'
                    : 'bg-[var(--border-default)]'
                }
              `}
              title={phase.label}
            />
          );
        })}
      </div>
    </div>
  );
}
