'use client';

import { useEffect } from 'react';
import { useInterviewStore } from '@/stores/interviewStore';
import { useNetworkCheck } from '@/hooks/useNetworkCheck';
import { Wifi, WifiOff, Signal, SignalLow, SignalMedium, SignalHigh } from 'lucide-react';

// ============================================
// CONNECTION STATUS COMPONENT
// ============================================
// Shows ping latency and connection quality in footer

export function ConnectionStatus() {
  const wsConnected = useInterviewStore((state) => state.wsConnected);
  const pageState = useInterviewStore((state) => state.pageState);
  
  const {
    connectionQuality,
    pingLatency,
    lastPingTime,
    startPingInterval,
    stopPingInterval,
  } = useNetworkCheck();

  // Start ping interval when interview is active
  useEffect(() => {
    if (pageState === 'active' && wsConnected) {
      startPingInterval();
    } else {
      stopPingInterval();
    }
    
    return () => {
      stopPingInterval();
    };
  }, [pageState, wsConnected, startPingInterval, stopPingInterval]);

  // Get signal icon based on quality
  const getSignalIcon = () => {
    switch (connectionQuality) {
      case 'excellent':
        return <SignalHigh className="w-4 h-4 text-[var(--success)]" />;
      case 'good':
        return <SignalMedium className="w-4 h-4 text-[var(--success)]" />;
      case 'poor':
        return <SignalLow className="w-4 h-4 text-[var(--warning)]" />;
      case 'offline':
        return <WifiOff className="w-4 h-4 text-[var(--error)]" />;
      default:
        return <Signal className="w-4 h-4 text-[var(--text-muted)]" />;
    }
  };

  // Get quality text
  const getQualityText = () => {
    switch (connectionQuality) {
      case 'excellent':
        return 'Mükemmel';
      case 'good':
        return 'İyi';
      case 'poor':
        return 'Zayıf';
      case 'offline':
        return 'Çevrimdışı';
      default:
        return 'Kontrol ediliyor...';
    }
  };

  // Get latency color class
  const getLatencyColor = () => {
    if (pingLatency === null) return 'text-[var(--text-muted)]';
    if (pingLatency < 100) return 'text-[var(--success)]';
    if (pingLatency < 300) return 'text-[var(--warning)]';
    return 'text-[var(--error)]';
  };

  // Format last ping time
  const formatLastPing = () => {
    if (!lastPingTime) return '';
    const seconds = Math.floor((Date.now() - lastPingTime) / 1000);
    if (seconds < 5) return 'az önce';
    if (seconds < 60) return `${seconds}sn önce`;
    return `${Math.floor(seconds / 60)}dk önce`;
  };

  return (
    <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-1.5 sm:py-2 bg-[var(--bg-tertiary)] rounded-lg text-xs sm:text-sm">
      {/* WebSocket Status */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {wsConnected ? (
          <Wifi className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--success)]" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--error)]" />
        )}
        <span className="text-[var(--text-secondary)]">
          {wsConnected ? 'Bağlı' : 'Bağlantı Yok'}
        </span>
      </div>

      <div className="w-px h-3.5 bg-[var(--border-default)]" />

      {/* Signal Quality */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {getSignalIcon()}
        <span className="text-[var(--text-secondary)]">
          {getQualityText()}
        </span>
      </div>

      {/* Ping Latency */}
      {pingLatency !== null && (
        <>
          <div className="w-px h-3.5 bg-[var(--border-default)]" />
          <div className="flex items-center gap-1.5">
            <span className={getLatencyColor()}>
              {pingLatency}ms
            </span>
            <span className="text-[var(--text-muted)] text-xs hidden sm:inline">
              ({formatLastPing()})
            </span>
          </div>
        </>
      )}
    </div>
  );
}
