'use client';

import { useState } from 'react';
import { useInterviewStore } from '@/stores/interviewStore';
import type { CallbackDebugInfo } from '@/stores/interviewStore';
import { CheckCircle, Loader2, AlertTriangle, Mic, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

// ============================================
// COMPLETED SCREEN
// ============================================

export function CompletedScreen() {
  const session = useInterviewStore((state) => state.session);
  const elapsedSeconds = useInterviewStore((state) => state.elapsedSeconds);
  const recordingStatus = useInterviewStore((state) => state.recordingStatus);
  const recordingMessage = useInterviewStore((state) => state.recordingMessage);
  const recordingError = useInterviewStore((state) => state.recordingError);
  const callbackDebug = useInterviewStore((state) => state.callbackDebug);

  const hasLiveData = elapsedSeconds > 0;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedTime = `${minutes} dakika ${seconds} saniye`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)] px-4 py-8 pb-safe">
      <div className="w-full max-w-2xl text-center">
        {/* Success Icon */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-5 sm:mb-6 rounded-full bg-[var(--success)]/10 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 text-[var(--success)]" />
        </div>

        {/* Thank You Message */}
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] mb-2">
          Görüşme Tamamlandı
        </h1>
        
        <p className="text-[var(--text-secondary)] text-sm sm:text-base mb-5 sm:mb-6">
          {session?.candidateName
            ? `Katılımınız için teşekkür ederiz, ${session.candidateName}.`
            : 'Bu görüşme başarıyla tamamlanmıştır.'}
        </p>

        {/* Stats Card - only if we have data */}
        {(session?.assessmentTitle || hasLiveData) && (
          <div className="bg-[var(--bg-secondary)] rounded-lg p-5 sm:p-6 mb-5 sm:mb-6">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {session?.assessmentTitle && (
                <div className={hasLiveData ? '' : 'col-span-2'}>
                  <p className="text-[var(--text-muted)] text-sm">Değerlendirme</p>
                  <p className="text-[var(--text-primary)] font-medium text-sm sm:text-base">
                    {session.assessmentTitle}
                  </p>
                </div>
              )}
              {hasLiveData && session?.totalQuestions ? (
                <div>
                  <p className="text-[var(--text-muted)] text-sm">Toplam Soru</p>
                  <p className="text-[var(--text-primary)] font-medium">
                    {session.totalQuestions}
                  </p>
                </div>
              ) : null}
              {hasLiveData && (
                <div className="col-span-2">
                  <p className="text-[var(--text-muted)] text-sm">Süre</p>
                  <p className="text-[var(--text-primary)] font-medium">
                    {formattedTime}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recording Status - only from live session */}
        {recordingStatus && (
          <RecordingStatusCard
            status={recordingStatus}
            message={recordingMessage}
            error={recordingError}
          />
        )}

        {/* Callback Debug Panel - only from live session */}
        {hasLiveData && <CallbackDebugPanel debug={callbackDebug} />}

        {/* Next Steps */}
        <div className="text-left bg-[var(--bg-secondary)] rounded-lg p-4">
          <p className="text-[var(--text-secondary)] text-sm">
            Değerlendirme sonuçlarınız yöneticinize iletilmiştir.
            Bu pencereyi kapatabilirsiniz.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------- Recording Status Card ----------

function RecordingStatusCard({
  status,
  message,
  error,
}: {
  status: string;
  message: string | null;
  error: string | null;
}) {
  const isProcessing = status === 'recording' || status === 'processing';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';

  return (
    <div
      className={`mb-6 rounded-lg p-4 text-left border ${
        isCompleted
          ? 'bg-emerald-500/5 border-emerald-500/20'
          : isFailed
            ? 'bg-red-500/5 border-red-500/20'
            : 'bg-blue-500/5 border-blue-500/20'
      }`}
    >
      <div className="flex items-center gap-3 mb-1">
        {isProcessing && (
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
        )}
        {isCompleted && (
          <Mic className="w-5 h-5 text-emerald-400 flex-shrink-0" />
        )}
        {isFailed && (
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
        )}

        <span
          className={`text-sm font-medium ${
            isCompleted
              ? 'text-emerald-400'
              : isFailed
                ? 'text-red-400'
                : 'text-blue-400'
          }`}
        >
          {message || 'Ses kaydı işleniyor...'}
        </span>
      </div>

      {isFailed && error && (
        <div className="mt-2 ml-8">
          <p className="text-[var(--text-muted)] text-xs font-mono break-all">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------- Callback Debug Panel ----------

function CallbackDebugPanel({ debug }: { debug: CallbackDebugInfo | null }) {
  const [expanded, setExpanded] = useState<'request' | 'response' | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  if (!debug) {
    return (
      <div className="mb-6 rounded-lg p-4 text-left border border-yellow-500/20 bg-yellow-500/5">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-yellow-400 animate-spin flex-shrink-0" />
          <span className="text-sm font-medium text-yellow-400">
            Callback gönderiliyor...
          </span>
        </div>
      </div>
    );
  }

  const requestJson = JSON.stringify(debug.requestPayload, null, 2);
  const responseJson = JSON.stringify(debug.responseBody, null, 2);

  const handleCopy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div
      className={`mb-6 rounded-lg text-left border ${
        debug.success
          ? 'border-emerald-500/20 bg-emerald-500/5'
          : 'border-red-500/20 bg-red-500/5'
      }`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {debug.success ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            )}
            <div>
              <span className={`text-sm font-medium ${debug.success ? 'text-emerald-400' : 'text-red-400'}`}>
                Callback {debug.success ? 'Başarılı' : 'Başarısız'}
              </span>
              <span className="text-xs text-[var(--text-muted)] ml-2">
                {debug.responseStatus && `HTTP ${debug.responseStatus}`}
                {debug.durationMs > 0 && ` · ${debug.durationMs}ms`}
              </span>
            </div>
          </div>
        </div>
        {debug.error && (
          <p className="text-xs text-red-400 mt-2 font-mono">{debug.error}</p>
        )}
      </div>

      {/* Request Section */}
      <div className="border-t border-white/5">
        <button
          onClick={() => setExpanded(expanded === 'request' ? null : 'request')}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
        >
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Request Body
          </span>
          {expanded === 'request' ? (
            <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
          )}
        </button>
        {expanded === 'request' && (
          <div className="px-4 pb-4">
            <div className="flex justify-end mb-2">
              <button
                onClick={() => handleCopy(requestJson, 'request')}
                className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                {copied === 'request' ? (
                  <><Check className="w-3.5 h-3.5" /> Kopyalandı</>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /> Kopyala</>
                )}
              </button>
            </div>
            <pre className="text-xs font-mono text-[var(--text-secondary)] bg-black/30 rounded-md p-3 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre">
              {requestJson}
            </pre>
          </div>
        )}
      </div>

      {/* Response Section */}
      <div className="border-t border-white/5">
        <button
          onClick={() => setExpanded(expanded === 'response' ? null : 'response')}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
        >
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Response Body
            {debug.responseStatus && (
              <span className={`ml-2 text-xs ${debug.success ? 'text-emerald-400' : 'text-red-400'}`}>
                ({debug.responseStatus})
              </span>
            )}
          </span>
          {expanded === 'response' ? (
            <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
          )}
        </button>
        {expanded === 'response' && (
          <div className="px-4 pb-4">
            <div className="flex justify-end mb-2">
              <button
                onClick={() => handleCopy(responseJson, 'response')}
                className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                {copied === 'response' ? (
                  <><Check className="w-3.5 h-3.5" /> Kopyalandı</>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /> Kopyala</>
                )}
              </button>
            </div>
            <pre className="text-xs font-mono text-[var(--text-secondary)] bg-black/30 rounded-md p-3 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre">
              {responseJson}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
