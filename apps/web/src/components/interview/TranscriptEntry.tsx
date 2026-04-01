'use client';

import { useState } from 'react';
import { Bot, User, Lightbulb } from 'lucide-react';

// ============================================
// TRANSCRIPT ENTRY
// ============================================
// Individual message bubble in transcript

interface TranscriptEntryProps {
  speaker: 'ai' | 'candidate';
  content: string;
  timestamp?: number;
  isPartial?: boolean;
  reasoning?: string | null; // AI'ın neden bu soruyu sorduğunun açıklaması
}

export function TranscriptEntry({
  speaker,
  content,
  timestamp,
  isPartial = false,
  reasoning,
}: TranscriptEntryProps) {
  const isAi = speaker === 'ai';
  const [showReasoning, setShowReasoning] = useState(false);

  // Format timestamp
  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className={`
        flex gap-3
        ${isAi ? 'flex-row' : 'flex-row-reverse'}
      `}
    >
      {/* Avatar */}
      <div
        className={`
          flex-shrink-0 w-8 h-8 rounded-full
          flex items-center justify-center
          ${isAi 
            ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]' 
            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
          }
        `}
      >
        {isAi ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
      </div>

      {/* Message Bubble */}
      <div
        className={`
          max-w-[80%] rounded-lg px-4 py-2
          ${isAi 
            ? 'bg-[var(--accent-primary)]/10 text-[var(--text-primary)]' 
            : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
          }
          ${isPartial ? 'opacity-70 italic' : ''}
        `}
      >
        {/* Speaker Label */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {isAi ? 'AI' : 'Siz'}
          </span>
          {timestamp && (
            <span className="text-xs text-[var(--text-muted)]">
              {formatTime(timestamp)}
            </span>
          )}
          {isPartial && (
            <span className="text-xs text-[var(--text-muted)]">
              (yazılıyor...)
            </span>
          )}
        </div>

        {/* Content */}
        <p className="text-sm whitespace-pre-wrap break-words">
          {content}
        </p>

        {/* Reasoning Section (AI messages only) */}
        {isAi && reasoning && (
          <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]">
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>{showReasoning ? 'Gizle' : 'Neden bu soru?'}</span>
            </button>
            {showReasoning && (
              <p className="mt-1.5 text-xs text-[var(--text-muted)] italic bg-[var(--bg-tertiary)] rounded px-2 py-1.5">
                {reasoning}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
