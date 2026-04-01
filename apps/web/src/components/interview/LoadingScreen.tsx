'use client';

import { Spinner } from '@/components/common/Spinner';

// ============================================
// LOADING SCREEN
// ============================================
// Shows while connecting to session

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)]">
      <div className="text-center">
        <Spinner size="lg" className="mx-auto mb-4" />
        <h2 className="text-xl font-medium text-[var(--text-primary)]">
          Yükleniyor...
        </h2>
        <p className="text-[var(--text-secondary)] mt-2">
          Görüşme oturumu hazırlanıyor
        </p>
      </div>
    </div>
  );
}
