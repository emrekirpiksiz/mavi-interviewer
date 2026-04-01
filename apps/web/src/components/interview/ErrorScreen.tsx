'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';

// ============================================
// ERROR SCREEN
// ============================================
// Error display with retry option

interface ErrorScreenProps {
  error: string;
  onRetry?: () => void;
}

export function ErrorScreen({ error, onRetry }: ErrorScreenProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-md text-center">
        {/* Error Icon */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--error)]/10 flex items-center justify-center">
          <AlertCircle className="w-12 h-12 text-[var(--error)]" />
        </div>

        {/* Error Message */}
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          Bir Hata Oluştu
        </h1>
        
        <p className="text-[var(--text-secondary)] mb-6">
          {error}
        </p>

        {/* Retry Button */}
        {onRetry && (
          <button
            onClick={onRetry}
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
            Tekrar Dene
          </button>
        )}

        {/* Help Text */}
        <div className="mt-8 text-left bg-[var(--bg-secondary)] rounded-lg p-4">
          <h3 className="text-[var(--text-primary)] font-medium mb-2">Sorun mu yaşıyorsunuz?</h3>
          <ul className="text-[var(--text-secondary)] text-sm space-y-1">
            <li>• Sayfayı yenilemeyi deneyin</li>
            <li>• İnternet bağlantınızı kontrol edin</li>
            <li>• Farklı bir tarayıcı kullanmayı deneyin</li>
            <li>• Sorun devam ederse bizimle iletişime geçin</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
