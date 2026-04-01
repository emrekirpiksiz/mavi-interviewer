'use client';

import { useInterviewStore, selectFormattedTime } from '@/stores/interviewStore';
import { Clock } from 'lucide-react';

// ============================================
// TIMER COMPONENT
// ============================================
// Displays elapsed time in MM:SS format

export function Timer() {
  const formattedTime = useInterviewStore(selectFormattedTime);

  return (
    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
      <Clock className="w-4 h-4" />
      <span className="font-mono text-sm">{formattedTime}</span>
    </div>
  );
}
