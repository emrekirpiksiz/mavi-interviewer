'use client';

import { RefreshCw, CheckCircle, Loader2, Circle } from 'lucide-react';
import { useInterviewStore } from '@/stores/interviewStore';
import type { ReconnectStep } from '@/stores/interviewStore';

// ============================================
// RECONNECTING SCREEN
// ============================================
// Shows reconnection progress with step indicators

const STEPS: { key: ReconnectStep; label: string; doneLabel?: string }[] = [
  { key: 'ws_connected', label: 'Sunucu bağlantısı kuruluyor...', doneLabel: 'Sunucu bağlantısı kuruldu' },
  { key: 'transcript_loaded', label: 'Görüşme bilgileri yükleniyor...', doneLabel: 'Görüşme bilgileri yüklendi' },
  { key: 'avatar_initializing', label: 'Avatar hazırlanıyor...', doneLabel: 'Avatar hazır' },
  { key: 'resuming', label: 'Görüşme devam ettiriliyor...', doneLabel: 'Görüşme devam edecek' },
];

function getStepStatus(currentStep: ReconnectStep, stepKey: ReconnectStep): 'done' | 'active' | 'pending' {
  const order: ReconnectStep[] = ['connecting', 'ws_connected', 'transcript_loaded', 'avatar_initializing', 'resuming', 'done'];
  const currentIndex = order.indexOf(currentStep);
  const stepIndex = order.indexOf(stepKey);
  
  // Current step'ten öncekiler tamamlanmış
  if (stepIndex < currentIndex) return 'done';
  // Current step aktif (spinner)
  if (stepIndex === currentIndex) return 'active';
  return 'pending';
}

export function ReconnectingScreen() {
  const reconnectStep = useInterviewStore((state) => state.reconnectStep);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-md text-center">
        {/* Animated Icon */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--accent-primary)]/10 flex items-center justify-center">
          <RefreshCw className="w-12 h-12 text-[var(--accent-primary)] animate-spin" style={{ animationDuration: '2s' }} />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          Görüşmeye Yeniden Bağlanılıyor...
        </h1>
        
        <p className="text-[var(--text-secondary)] mb-8">
          Bu işlem birkaç saniye sürebilir.
        </p>

        {/* Step Progress */}
        <div className="bg-[var(--bg-secondary)] rounded-lg p-6 text-left">
          <div className="space-y-4">
            {STEPS.map((step) => {
              const status = getStepStatus(reconnectStep, step.key);
              return (
                <div key={step.key} className="flex items-center gap-3">
                  {status === 'done' && (
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                  )}
                  {status === 'active' && (
                    <Loader2 className="w-5 h-5 text-[var(--accent-primary)] animate-spin flex-shrink-0" />
                  )}
                  {status === 'pending' && (
                    <Circle className="w-5 h-5 text-[var(--text-secondary)]/40 flex-shrink-0" />
                  )}
                  <span className={`text-sm ${
                    status === 'done' ? 'text-[var(--text-primary)]' :
                    status === 'active' ? 'text-[var(--accent-primary)]' :
                    'text-[var(--text-secondary)]/60'
                  }`}>
                    {status === 'done' && step.doneLabel ? step.doneLabel : step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
