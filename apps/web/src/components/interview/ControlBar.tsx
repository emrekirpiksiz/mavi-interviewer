'use client';

import { Mic, MicOff, PhoneOff, Loader2, ArrowUp } from 'lucide-react';

interface ControlBarProps {
  onEndCall: () => void;
  onMicToggle: () => void;
  isListening: boolean;
  isProcessing: boolean;
  recordingSeconds: number;
  isAiSpeaking: boolean;
  isAiGenerating: boolean;
  currentTurn: 'ai' | 'candidate';
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
    <div className="bg-[var(--bg-secondary)] border-t border-[var(--border-default)] px-4 py-4">
      <div className="max-w-md mx-auto flex items-center justify-center gap-6">
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
              ${isMicDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}
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
            w-14 h-14 rounded-full
            bg-[var(--error)] text-white
            flex items-center justify-center
            transition-all
            hover:bg-[var(--error)]/80
          "
          title="Görüşmeyi Bitir"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>

      {/* Help Text */}
      <div className="mt-3 text-center text-[var(--text-muted)] text-xs">
        {isAiBusy && !isListening && (
          <span className="text-blue-400">AI {isAiGenerating ? 'düşünüyor' : 'konuşuyor'}. Lütfen dinleyin...</span>
        )}
        {isProcessing && !isAiBusy && (
          <span className="text-yellow-400">Yanıtınız işleniyor, lütfen bekleyin...</span>
        )}
        {isListening && !isProcessing && !isAiBusy && (
          <span className="text-red-400">Konuşmanız kaydediliyor. Bitirdiğinizde Gönder butonuna basın.</span>
        )}
        {currentTurn === 'candidate' && !isListening && !isProcessing && !isAiBusy && (
          <span className="text-green-400">Sıra sizde! Mikrofon butonuna basıp konuşmaya başlayın.</span>
        )}
      </div>
    </div>
  );
}
