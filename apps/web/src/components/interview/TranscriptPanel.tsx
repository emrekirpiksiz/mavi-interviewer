'use client';

import { useEffect, useRef } from 'react';
import { useInterviewStore } from '@/stores/interviewStore';
import { TranscriptEntry } from './TranscriptEntry';
import { Loader2 } from 'lucide-react';

// ============================================
// TRANSCRIPT PANEL
// ============================================
// Scrollable list of conversation entries

export function TranscriptPanel() {
  const transcriptEntries = useInterviewStore((state) => state.transcriptEntries);
  const partialTranscript = useInterviewStore((state) => state.partialTranscript);
  const systemMessage = useInterviewStore((state) => state.systemMessage);
  const interviewState = useInterviewStore((state) => state.interviewState);
  
  // CRITICAL: Only show partial transcript when candidate is actually speaking
  // Hide it when AI is speaking/generating to prevent showing AI audio transcription
  const showPartialTranscript = partialTranscript && 
    (interviewState === 'candidate_speaking' || interviewState === 'waiting_candidate');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries are added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptEntries, partialTranscript, systemMessage]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-4 space-y-4"
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
          reasoning={entry.reasoning}
        />
      ))}

      {/* Partial transcript (candidate currently speaking) - ONLY when candidate's turn */}
      {showPartialTranscript && (
        <TranscriptEntry
          speaker="candidate"
          content={partialTranscript}
          isPartial
        />
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
      {transcriptEntries.length === 0 && !showPartialTranscript && !systemMessage && (
        <div className="flex items-center justify-center h-full">
          <p className="text-[var(--text-muted)] text-sm text-center">
            Görüşme başladığında konuşmalar burada görünecek
          </p>
        </div>
      )}
    </div>
  );
}
