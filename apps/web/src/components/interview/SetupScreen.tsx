'use client';

import { useState, useEffect } from 'react';
import { Spinner } from '@/components/common/Spinner';
import { useInterviewStore } from '@/stores/interviewStore';
import { Mic, Wifi, Check, X } from 'lucide-react';

// ============================================
// SETUP SCREEN
// ============================================
// Handles microphone permission and connection checks

interface SetupScreenProps {
  onMicPermissionRequest: () => Promise<boolean>;
}

type CheckStatus = 'pending' | 'loading' | 'success' | 'error';

export function SetupScreen({ onMicPermissionRequest }: SetupScreenProps) {
  const micPermission = useInterviewStore((state) => state.micPermission);
  const wsConnected = useInterviewStore((state) => state.wsConnected);
  const session = useInterviewStore((state) => state.session);

  const [micStatus, setMicStatus] = useState<CheckStatus>('pending');

  // Auto-request microphone permission
  useEffect(() => {
    const requestMic = async () => {
      if (micPermission === 'pending') {
        setMicStatus('loading');
        const granted = await onMicPermissionRequest();
        setMicStatus(granted ? 'success' : 'error');
      } else if (micPermission === 'granted') {
        setMicStatus('success');
      } else {
        setMicStatus('error');
      }
    };
    requestMic();
  }, [micPermission, onMicPermissionRequest]);

  const getStatusIcon = (status: CheckStatus) => {
    switch (status) {
      case 'loading':
        return <Spinner size="sm" />;
      case 'success':
        return <Check className="w-5 h-5 text-[var(--success)]" />;
      case 'error':
        return <X className="w-5 h-5 text-[var(--error)]" />;
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-[var(--border-default)]" />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Görüşmeye Hazırlık
          </h1>
          {session && (
            <p className="text-[var(--text-secondary)] mt-2">
              {session.companyName} - {session.positionTitle}
            </p>
          )}
        </div>

        {/* Checklist */}
        <div className="bg-[var(--bg-secondary)] rounded-lg p-6 space-y-4">
          {/* WebSocket Connection */}
          <div className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-tertiary)]">
            <div className="flex items-center gap-3">
              <Wifi className="w-5 h-5 text-[var(--accent-primary)]" />
              <span className="text-[var(--text-primary)]">Sunucu Bağlantısı</span>
            </div>
            {getStatusIcon(wsConnected ? 'success' : 'loading')}
          </div>

          {/* Microphone Permission */}
          <div className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-tertiary)]">
            <div className="flex items-center gap-3">
              <Mic className="w-5 h-5 text-[var(--accent-primary)]" />
              <span className="text-[var(--text-primary)]">Mikrofon İzni</span>
            </div>
            {getStatusIcon(micStatus)}
          </div>
        </div>

        {/* Error messages */}
        {micStatus === 'error' && (
          <div className="mt-4 p-4 bg-[var(--error)]/10 border border-[var(--error)]/30 rounded-lg">
            <p className="text-[var(--error)] text-sm">
              Mikrofon izni gereklidir. Lütfen tarayıcı ayarlarından mikrofon iznini etkinleştirin.
            </p>
            <button
              onClick={() => {
                setMicStatus('loading');
                onMicPermissionRequest().then((granted) => {
                  setMicStatus(granted ? 'success' : 'error');
                });
              }}
              className="mt-2 text-[var(--accent-primary)] text-sm hover:underline"
            >
              Tekrar Dene
            </button>
          </div>
        )}

        {/* Info text */}
        <p className="text-[var(--text-muted)] text-sm text-center mt-6">
          {wsConnected && micStatus === 'success'
            ? 'Hazırlıklar tamamlanıyor...'
            : 'Görüşme için gerekli izinler kontrol ediliyor...'}
        </p>
      </div>
    </div>
  );
}
