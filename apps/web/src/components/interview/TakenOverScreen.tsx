'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

// ============================================
// TAKEN OVER SCREEN
// ============================================
// Shows when session is taken over by another browser/tab

interface TakenOverScreenProps {
  onReconnect: () => void;
}

export function TakenOverScreen({ onReconnect }: TakenOverScreenProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-md text-center">
        {/* Warning Icon */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-yellow-500/10 flex items-center justify-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          Oturum Başka Bir Tarayıcıdan Devam Ediyor
        </h1>
        
        <p className="text-[var(--text-secondary)] mb-6">
          Bu görüşme başka bir tarayıcı veya sekmeden devam ettiriliyor.
          Eğer bu siz değilseniz, aşağıdaki butona tıklayarak tekrar bağlanabilirsiniz.
        </p>

        {/* Reconnect Button */}
        <button
          onClick={onReconnect}
          className="
            px-6 py-3
            bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)]
            text-white font-medium
            rounded-lg
            transition-colors
            flex items-center justify-center gap-2
            mx-auto
          "
        >
          <RefreshCw className="w-4 h-4" />
          Yeniden Bağlan
        </button>

        {/* Help Text */}
        <div className="mt-8 text-left bg-[var(--bg-secondary)] rounded-lg p-4">
          <h3 className="text-[var(--text-primary)] font-medium mb-2">Ne oldu?</h3>
          <p className="text-[var(--text-secondary)] text-sm">
            Her görüşme oturumu aynı anda yalnızca bir tarayıcıdan takip edilebilir.
            Başka bir tarayıcı veya sekmeden bu görüşmeye bağlanıldığında, eski bağlantı otomatik olarak kesilir.
          </p>
        </div>
      </div>
    </div>
  );
}
