'use client';

import { useInterviewStore } from '@/stores/interviewStore';
import { CheckCircle, Loader2, AlertTriangle, Mic } from 'lucide-react';

// ============================================
// COMPLETED SCREEN
// ============================================
// Thank you message after interview completion
// Shows recording status and errors if audio recording is active

export function CompletedScreen() {
  const session = useInterviewStore((state) => state.session);
  const elapsedSeconds = useInterviewStore((state) => state.elapsedSeconds);
  const recordingStatus = useInterviewStore((state) => state.recordingStatus);
  const recordingMessage = useInterviewStore((state) => state.recordingMessage);
  const recordingError = useInterviewStore((state) => state.recordingError);

  // Format elapsed time
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedTime = `${minutes} dakika ${seconds} saniye`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-md text-center">
        {/* Success Icon */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--success)]/10 flex items-center justify-center">
          <CheckCircle className="w-12 h-12 text-[var(--success)]" />
        </div>

        {/* Thank You Message */}
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          Görüşme Tamamlandı
        </h1>
        
        <p className="text-[var(--text-secondary)] mb-6">
          Zaman ayırdığınız için teşekkür ederiz
          {session?.candidateName ? `, ${session.candidateName}` : ''}.
        </p>

        {/* Stats Card */}
        <div className="bg-[var(--bg-secondary)] rounded-lg p-6 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[var(--text-muted)] text-sm">Şirket</p>
              <p className="text-[var(--text-primary)] font-medium">
                {session?.companyName || '-'}
              </p>
            </div>
            <div>
              <p className="text-[var(--text-muted)] text-sm">Pozisyon</p>
              <p className="text-[var(--text-primary)] font-medium">
                {session?.positionTitle || '-'}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-[var(--text-muted)] text-sm">Görüşme Süresi</p>
              <p className="text-[var(--text-primary)] font-medium">
                {formattedTime}
              </p>
            </div>
          </div>
        </div>

        {/* Recording Status */}
        {recordingStatus && (
          <RecordingStatusCard
            status={recordingStatus}
            message={recordingMessage}
            error={recordingError}
          />
        )}

        {/* Next Steps */}
        <div className="text-left bg-[var(--bg-secondary)] rounded-lg p-4">
          <h3 className="text-[var(--text-primary)] font-medium mb-2">Sonraki Adımlar:</h3>
          <p className="text-[var(--text-secondary)] text-sm">
            Görüşmeniz değerlendirilecek ve en kısa sürede sizinle iletişime geçilecektir.
            Bu pencereyi şimdi kapatabilirsiniz.
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
