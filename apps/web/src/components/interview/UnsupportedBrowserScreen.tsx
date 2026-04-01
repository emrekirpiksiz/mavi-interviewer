'use client';

import { Monitor, Chrome } from 'lucide-react';
import type { BrowserCheckResult } from '@/lib/browserCheck';
import { getBrowserWarningMessage } from '@/lib/browserCheck';

interface UnsupportedBrowserScreenProps {
  browserCheck: BrowserCheckResult;
}

export function UnsupportedBrowserScreen({ browserCheck }: UnsupportedBrowserScreenProps) {
  const message = getBrowserWarningMessage(browserCheck);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[var(--warning)]/10 flex items-center justify-center">
            <Monitor className="w-8 h-8 text-[var(--warning)]" />
          </div>
          <div className="w-16 h-16 rounded-full bg-[var(--accent-primary)]/10 flex items-center justify-center">
            <Chrome className="w-8 h-8 text-[var(--accent-primary)]" />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-3">
            Desteklenmeyen Ortam
          </h1>
          <p className="text-[var(--text-secondary)] leading-relaxed">
            {message}
          </p>
        </div>

        <div className="pt-2">
          <a
            href="https://www.google.com/chrome/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors font-medium"
          >
            <Chrome className="w-5 h-5" />
            Chrome İndir
          </a>
        </div>

        <p className="text-[var(--text-muted)] text-xs">
          Diğer tarayıcılar için testlerimiz devam etmektedir.
        </p>
      </div>
    </div>
  );
}
