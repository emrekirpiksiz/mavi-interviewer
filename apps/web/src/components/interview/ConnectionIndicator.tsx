'use client';

import { useInterviewStore } from '@/stores/interviewStore';

// ============================================
// CONNECTION INDICATOR
// ============================================
// Shows WebSocket connection status

export function ConnectionIndicator() {
  const wsConnected = useInterviewStore((state) => state.wsConnected);

  return (
    <div className="flex items-center gap-2">
      <div
        className={`
          w-2 h-2 rounded-full
          ${wsConnected
            ? 'bg-[var(--success)]'
            : 'bg-[var(--error)] animate-pulse'
          }
        `}
      />
      <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
        {wsConnected ? 'Bağlı' : 'Bağlantı Yok'}
      </span>
    </div>
  );
}
