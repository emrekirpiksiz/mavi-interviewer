'use client';

import { Mic, MicOff, PhoneOff, Loader2, ArrowUp, MessageSquare } from 'lucide-react';

interface ControlBarProps {
  onEndCall: () => void;
  onMicToggle: () => void;
  isListening: boolean;
  isProcessing: boolean;
  recordingSeconds: number;
  isAiSpeaking: boolean;
  isAiGenerating: boolean;
  currentTurn: 'ai' | 'candidate';
  onToggleTranscript?: () => void;
  transcriptCount?: number;
}

export function ControlBar({
  onEndCall,
  onMicToggle,
  isListening,
  isProcessing,
  recordingSeconds,
  isAiSpeaking,
  isAiGenerating,
  currentTurn,
  onToggleTranscript,
  transcriptCount = 0,
}: ControlBarProps) {
  const isAiBusy = isAiSpeaking || isAiGenerating;
  const isMicDisabled = currentTurn === 'ai' || isAiBusy || isProcessing;

  const getMicButtonStyle = () => {
    if (isListening) return 'bg-[var(--error)] text-white animate-pulse ring-4 ring-red-500/50';
    if (isProcessing) return 'bg-[var(--warning)] text-white';
    if (currentTurn === 'candidate' && !isAiBusy) return 'bg-[var(--success)] text-white ring-2 ring-green-500/50 animate-pulse';
    return 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]';
  };

  const getMicTitle = () => {
    if (isAiBusy) return 'AI meşgul, bekleyin';
    if (isListening) return 'Gönder';
    if (isProcessing) return 'İşleniyor...';
    return 'Konuşmaya Başla';
  };

  return (
    <div className="bg-[var(--bg-secondary)] border-t border-[var(--border-default)] px-4 py-3 lg:py-4 pb-safe flex-shrink-0">
      <div className="max-w-md mx-auto flex items-center justify-center gap-5 lg:gap-6">
        {/* Transcript toggle - mobile only */}
        {onToggleTranscript && (
          <button
            onClick={onToggleTranscript}
            className="lg:hidden relative w-12 h-12 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] flex items-center justify-center transition-all active:scale-95"
            title="Görüşme kaydı"
          >
            <MessageSquare className="w-5 h-5" />
            {transcriptCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-[var(--accent-primary)] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {transcriptCount > 99 ? '99+' : transcriptCount}
              </span>
            )}
          </button>
        )}

        {/* Microphone / Send Button */}
        <div className="relative">
          <button
            onClick={onMicToggle}
            disabled={isMicDisabled}
            className={`
              w-16 h-16 rounded-full
              flex items-center justify-center
              transition-all
              ${getMicButtonStyle()}
              ${isMicDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}
            `}
            title={getMicTitle()}
          >
            {isProcessing ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : isListening ? (
              <div className="flex flex-col items-center">
                <ArrowUp className="w-6 h-6" />
                <span className="text-xs font-bold">{recordingSeconds}s</span>
              </div>
            ) : isAiBusy ? (
              <MicOff className="w-7 h-7 text-gray-500" />
            ) : (
              <Mic className="w-7 h-7" />
            )}
          </button>
          {isListening && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping" />
          )}
          {currentTurn === 'candidate' && !isListening && !isProcessing && !isAiBusy && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full animate-pulse" />
          )}
        </div>

        {/* End Call Button */}
        <button
          onClick={onEndCall}
          className="
            w-12 h-12 lg:w-14 lg:h-14 rounded-full
            bg-[var(--error)] text-white
            flex items-center justify-center
            transition-all
            hover:bg-[var(--error)]/80
            active:scale-95
          "
          title="Görüşmeyi Bitir"
        >
          <PhoneOff className="w-5 h-5 lg:w-6 lg:h-6" />
        </button>
      </div>

      {/* Help Text */}
      <div className="mt-2 lg:mt-3 text-center text-[var(--text-muted)] text-xs">
        {isAiBusy && !isListening && (
          <span className="text-blue-400">AI {isAiGenerating ? 'düşünüyor' : 'konuşuyor'}. Lütfen dinleyin...</span>
        )}
        {isProcessing && !isAiBusy && (
          <span className="text-yellow-400">Yanıtınız işleniyor...</span>
        )}
        {isListening && !isProcessing && !isAiBusy && (
          <span className="text-red-400">Kaydediliyor. Bitirdiğinizde Gönder&apos;e basın.</span>
        )}
        {currentTurn === 'candidate' && !isListening && !isProcessing && !isAiBusy && (
          <span className="text-green-400">Sıra sizde! Mikrofon butonuna basın.</span>
        )}
      </div>
    </div>
  );
}
