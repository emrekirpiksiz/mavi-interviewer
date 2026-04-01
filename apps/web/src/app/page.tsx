'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Monitor, Chrome } from 'lucide-react';
import { checkBrowserCompatibility, getBrowserWarningMessage, type BrowserCheckResult } from '@/lib/browserCheck';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [browserCheck, setBrowserCheck] = useState<BrowserCheckResult | null>(null);

  useEffect(() => {
    setBrowserCheck(checkBrowserCompatibility());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const code = accessCode.trim();
    
    if (!code) {
      setError('Katılım kodu gereklidir');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Backend'e kod gönder, backend doğrulayıp session oluşturacak
      const response = await fetch(`${API_URL}/demo-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Session oluşturulamadı');
      }

      const data = await response.json();
      const sessionId = data.data?.sessionId;

      if (!sessionId) {
        throw new Error('Session ID alınamadı');
      }

      // Interview sayfasına yönlendir
      router.push(`/interview/${sessionId}`);
    } catch (err) {
      console.error('Session oluşturma hatası:', err);
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="card p-8 max-w-md w-full text-center">
        {/* Logo/Icon */}
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-foreground mb-6">
          AI Interview
        </h1>

        {/* Browser Warning Banner */}
        {browserCheck && !browserCheck.isSupported && (
          <div className="mb-4 p-4 bg-[var(--warning)]/10 border border-[var(--warning)]/30 rounded-lg text-left">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {browserCheck.isMobile ? (
                  <Monitor className="w-5 h-5 text-[var(--warning)]" />
                ) : (
                  <Chrome className="w-5 h-5 text-[var(--warning)]" />
                )}
              </div>
              <div>
                <p className="text-[var(--warning)] text-sm font-medium mb-1">Tarayıcı Uyarısı</p>
                <p className="text-[var(--text-secondary)] text-sm">
                  {getBrowserWarningMessage(browserCheck)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Access Code Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="accessCode" className="block text-foreground-secondary text-sm mb-2">
              Lütfen katılım kodunuzu girin
            </label>
            <input
              id="accessCode"
              type="text"
              value={accessCode}
              onChange={(e) => {
                setAccessCode(e.target.value.toUpperCase());
                setError(null);
              }}
              placeholder="Katılım kodu"
              maxLength={10}
              className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-border rounded-lg text-foreground text-center text-lg font-mono tracking-widest placeholder:text-foreground-muted placeholder:tracking-normal placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              disabled={isLoading}
              autoComplete="off"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || accessCode.trim().length === 0}
            className="w-full py-3 px-4 bg-accent hover:bg-accent/90 disabled:bg-accent/50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Bağlanıyor...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span>Görüşmeye Katıl</span>
              </>
            )}
          </button>
          
          {error && (
            <p className="text-error text-sm">{error}</p>
          )}
        </form>

        {/* Info */}
        <div className="mt-6 pt-6 border-t border-border">
          <p className="text-foreground-muted text-xs">
            Katılım kodunuzu e-posta veya SMS ile almış olmalısınız.
          </p>
        </div>
      </div>
    </div>
  );
}
