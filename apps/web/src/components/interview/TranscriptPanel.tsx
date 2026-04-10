'use client';

import { useEffect, useRef } from 'react';
import { useInterviewStore } from '@/stores/interviewStore';
import { TranscriptEntry } from './TranscriptEntry';
import { Loader2, Mic } from 'lucide-react';

// ============================================
// TRANSCRIPT PANEL
// ============================================
// Scrollable list of conversation entries

export function TranscriptPanel() {
  const transcriptEntries = useInterviewStore((state) => state.transcriptEntries);
  const systemMessage = useInterviewStore((state) => state.systemMessage);
  const interviewState = useInterviewStore((state) => state.interviewState);
  
  const isListening = interviewState === 'candidate_speaking' || interviewState === 'waiting_candidate';
  const isProcessing = interviewState === 'processing';
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptEntries, systemMessage, isListening]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 overscroll-contain touch-pan-y"
    >
      {/* System message (loading states, etc.) */}
      {systemMessage && transcriptEntries.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-8 h-8 text-[var(--accent-primary)] animate-spin" />
            <p className="text-[var(--text-secondary)] text-sm">
              {systemMessage}
            </p>
          </div>
        </div>
      )}

      {/* Transcript entries */}
      {transcriptEntries.map((entry) => (
        <TranscriptEntry
          key={entry.id}
          speaker={entry.speaker}
          content={entry.content}
          timestamp={entry.timestamp}
          reasoning={undefined}
        />
      ))}

      {/* Listening indicator - replaces raw interim transcript */}
      {isListening && <ListeningIndicator />}

      {/* Processing indicator */}
      {isProcessing && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-default)]">
          <Loader2 className="w-4 h-4 text-[var(--accent-primary)] animate-spin flex-shrink-0" />
          <p className="text-[var(--text-secondary)] text-sm">Yanıtınız işleniyor...</p>
        </div>
      )}

      {/* System message indicator (during conversation) */}
      {systemMessage && transcriptEntries.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-tertiary)] rounded-lg">
          <Loader2 className="w-4 h-4 text-[var(--accent-primary)] animate-spin" />
          <p className="text-[var(--text-secondary)] text-sm">
            {systemMessage}
          </p>
        </div>
      )}

      {/* Empty state */}
      {transcriptEntries.length === 0 && !isListening && !systemMessage && (
        <div className="flex items-center justify-center h-full">
          <p className="text-[var(--text-muted)] text-sm text-center">
            Görüşme başladığında konuşmalar burada görünecek
          </p>
        </div>
      )}
    </div>
  );
}

function ListeningIndicator() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-green-500/5 border border-green-500/20 rounded-lg">
      <div className="relative flex-shrink-0">
        <Mic className="w-5 h-5 text-green-400" />
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" />
      </div>
      <div className="flex items-center gap-2">
        <p className="text-green-300/90 text-sm font-medium">Sizi dinliyorum...</p>
        <div className="flex gap-1 items-center">
          <span className="w-1.5 h-1.5 bg-green-400/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-green-400/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-green-400/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
