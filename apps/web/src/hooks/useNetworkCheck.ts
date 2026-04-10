'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useInterviewStore } from '@/stores/interviewStore';
import type { ConnectionQuality, AudioOutputStatus } from '@/stores/interviewStore';

// ============================================
// NETWORK CHECK HOOK
// ============================================
// Handles bandwidth testing, connection quality, audio output detection, and ping
// Compatible with Safari, Chrome, Firefox, Edge

interface UseNetworkCheckReturn {
  connectionQuality: ConnectionQuality;
  bandwidth: number | null;
  audioOutputStatus: AudioOutputStatus;
  pingLatency: number | null;
  lastPingTime: number | null;
  recheckConnection: () => Promise<void>;
  recheckAudioOutput: () => Promise<void>;
  startPingInterval: () => void;
  stopPingInterval: () => void;
}

// Ping interval in milliseconds (15 seconds)
const PING_INTERVAL = 15000;

// Quality thresholds (Mbps)
const QUALITY_THRESHOLDS = {
  excellent: 10,
  good: 5,
  poor: 2,
};

export function useNetworkCheck(): UseNetworkCheckReturn {
  const connectionQuality = useInterviewStore((state) => state.connectionQuality);
  const bandwidth = useInterviewStore((state) => state.bandwidth);
  const audioOutputStatus = useInterviewStore((state) => state.audioOutputStatus);
  const pingLatency = useInterviewStore((state) => state.pingLatency);
  const lastPingTime = useInterviewStore((state) => state.lastPingTime);
  const setConnectionQuality = useInterviewStore((state) => state.setConnectionQuality);
  const setBandwidth = useInterviewStore((state) => state.setBandwidth);
  const setAudioOutputStatus = useInterviewStore((state) => state.setAudioOutputStatus);
  const setPingLatency = useInterviewStore((state) => state.setPingLatency);
  const wsConnected = useInterviewStore((state) => state.wsConnected);
  
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate quality based on bandwidth
  const getQualityFromBandwidth = (mbps: number): ConnectionQuality => {
    if (mbps >= QUALITY_THRESHOLDS.excellent) return 'excellent';
    if (mbps >= QUALITY_THRESHOLDS.good) return 'good';
    if (mbps >= QUALITY_THRESHOLDS.poor) return 'poor';
    return 'poor'; // Even slow connection is not "offline"
  };

  // Test bandwidth using multiple methods for cross-browser compatibility
  const testBandwidth = useCallback(async (): Promise<{ online: boolean; bandwidth: number | null }> => {
    // Method 0: Check navigator.onLine first (most reliable for basic online check)
    if (!navigator.onLine) {
      return { online: false, bandwidth: null };
    }

    try {
      // Method 1: Use Network Information API if available (Chrome, Edge, Android)
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        if (connection?.downlink) {
          // downlink is in Mbps
          return { online: true, bandwidth: connection.downlink };
        }
        // effectiveType can be used as fallback
        if (connection?.effectiveType) {
          const effectiveTypeMap: Record<string, number> = {
            'slow-2g': 0.5,
            '2g': 1,
            '3g': 3,
            '4g': 10,
          };
          const estimatedBandwidth = effectiveTypeMap[connection.effectiveType] || 5;
          return { online: true, bandwidth: estimatedBandwidth };
        }
      }

      // Method 2: Try to fetch from our API with timeout
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:2223';
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const startTime = performance.now();
        
        const response = await fetch(`${apiUrl}/api/health`, {
          method: 'GET',
          cache: 'no-cache',
          signal: controller.signal,
          // Add mode for CORS
          mode: 'cors',
        });
        
        clearTimeout(timeoutId);
        
        const endTime = performance.now();
        const latency = endTime - startTime;

        if (response.ok) {
          // Estimate bandwidth based on latency
          // These are rough estimates since we can't measure actual download speed easily
          let estimatedBandwidth: number;
          if (latency < 100) {
            estimatedBandwidth = 20; // Excellent
          } else if (latency < 300) {
            estimatedBandwidth = 12; // Very good
          } else if (latency < 500) {
            estimatedBandwidth = 8; // Good
          } else if (latency < 1000) {
            estimatedBandwidth = 4; // OK
          } else {
            estimatedBandwidth = 2; // Slow but online
          }
          
          return { online: true, bandwidth: estimatedBandwidth };
        }
      } catch (fetchError) {
        // Fetch failed, but we might still be online
        // This can happen due to CORS, API being down, etc.
        console.log('API fetch failed, checking with alternative method:', fetchError);
      }

      // Method 3: If API fetch failed but navigator.onLine is true,
      // we're probably online but can't reach our API
      // Try a simple image load test as fallback
      try {
        const imageLoadTest = await new Promise<boolean>((resolve) => {
          const img = new Image();
          const timeout = setTimeout(() => {
            img.src = '';
            resolve(false);
          }, 3000);
          
          img.onload = () => {
            clearTimeout(timeout);
            resolve(true);
          };
          img.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
          };
          
          // Use a small, reliable image (1x1 pixel from data URI doesn't work for network test)
          // Try loading favicon from a CDN as a network test
          img.src = `https://www.google.com/favicon.ico?_=${Date.now()}`;
        });
        
        if (imageLoadTest) {
          return { online: true, bandwidth: 5 }; // Assume good connection
        }
      } catch {
        // Image test also failed
      }

      // Method 4: Last resort - trust navigator.onLine
      // Even if all tests fail, if navigator.onLine is true, user is probably online
      // but might have firewall/CORS issues
      if (navigator.onLine) {
        console.log('Network tests failed but navigator.onLine is true - assuming online');
        return { online: true, bandwidth: 5 }; // Assume moderate connection
      }

      return { online: false, bandwidth: null };

    } catch (error) {
      console.error('Bandwidth test failed:', error);
      // Final fallback to navigator.onLine
      return { online: navigator.onLine, bandwidth: navigator.onLine ? 5 : null };
    }
  }, []);

  // Check audio output devices
  const checkAudioOutput = useCallback(async (): Promise<AudioOutputStatus> => {
    try {
      // Method 1: Try AudioContext first (most reliable across browsers)
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioContext = new AudioContextClass();
          // If we can create an AudioContext, audio output is available
          await audioContext.close();
          return 'available';
        }
      } catch (audioContextError) {
        console.log('AudioContext check failed:', audioContextError);
      }

      // Method 2: Check mediaDevices if available
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioOutputDevices = devices.filter(device => device.kind === 'audiooutput');
          
          // Note: Safari might not list audiooutput devices without user interaction
          // but if we have any devices at all, audio is probably available
          if (audioOutputDevices.length > 0) {
            return 'available';
          }
          
          // If no audiooutput but we have other devices, audio is still likely available
          // (Safari behavior)
          if (devices.length > 0) {
            return 'available';
          }
        } catch (enumError) {
          console.log('enumerateDevices failed:', enumError);
        }
      }

      // Method 3: Assume available on desktop/laptop devices
      // Most devices have built-in speakers
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (!isMobile) {
        return 'available'; // Desktop/laptop usually has speakers
      }

      // For mobile, also assume available (they have speakers too)
      return 'available';

    } catch (error) {
      console.error('Audio output check failed:', error);
      // Assume available - better to let user try than block them
      return 'available';
    }
  }, []);

  // Recheck connection quality
  const recheckConnection = useCallback(async () => {
    setConnectionQuality('checking');
    setBandwidth(null);

    const result = await testBandwidth();
    
    if (!result.online) {
      setConnectionQuality('offline');
      setBandwidth(null);
    } else {
      setBandwidth(result.bandwidth);
      if (result.bandwidth !== null) {
        setConnectionQuality(getQualityFromBandwidth(result.bandwidth));
      } else {
        // Online but couldn't measure bandwidth - assume good
        setConnectionQuality('good');
      }
    }
  }, [setConnectionQuality, setBandwidth, testBandwidth]);

  // Recheck audio output
  const recheckAudioOutput = useCallback(async () => {
    setAudioOutputStatus('checking');
    const status = await checkAudioOutput();
    setAudioOutputStatus(status);
  }, [setAudioOutputStatus, checkAudioOutput]);

  // Measure ping latency to API server
  const measurePing = useCallback(async (): Promise<number | null> => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:2223';
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const startTime = performance.now();
      
      const response = await fetch(`${apiUrl}/api/health/ping`, {
        method: 'GET',
        cache: 'no-cache',
        signal: controller.signal,
        mode: 'cors',
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);
        return latency;
      }
      
      return null;
    } catch (error) {
      console.log('[NetworkCheck] Ping failed:', error);
      return null;
    }
  }, []);

  // Single ping measurement and store update
  const doPing = useCallback(async () => {
    const latency = await measurePing();
    setPingLatency(latency);
    
    // Update connection quality based on ping if we got a result
    if (latency !== null) {
      if (latency < 100) {
        setConnectionQuality('excellent');
      } else if (latency < 300) {
        setConnectionQuality('good');
      } else {
        setConnectionQuality('poor');
      }
    }
  }, [measurePing, setPingLatency, setConnectionQuality]);

  // Start periodic ping interval
  const startPingInterval = useCallback(() => {
    // Clear existing interval if any
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    
    // Do initial ping
    doPing();
    
    // Set up interval
    pingIntervalRef.current = setInterval(() => {
      doPing();
    }, PING_INTERVAL);
    
    console.log('[NetworkCheck] Ping interval started (every 15s)');
  }, [doPing]);

  // Stop ping interval
  const stopPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
      console.log('[NetworkCheck] Ping interval stopped');
    }
  }, []);

  // Initial checks on mount
  useEffect(() => {
    const runChecks = async () => {
      // Run both checks in parallel
      await Promise.all([
        recheckConnection(),
        recheckAudioOutput(),
      ]);
    };

    runChecks();

    // Listen for online/offline events
    const handleOnline = () => {
      console.log('Browser reports: online');
      recheckConnection();
    };
    const handleOffline = () => {
      console.log('Browser reports: offline');
      setConnectionQuality('offline');
      setBandwidth(null);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for Network Information API changes if available (Chrome/Edge)
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection) {
        connection.addEventListener('change', recheckConnection);
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        if (connection) {
          connection.removeEventListener('change', recheckConnection);
        }
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Also re-check when WebSocket connects (proves we have real connectivity)
  useEffect(() => {
    if (wsConnected && connectionQuality === 'offline') {
      // WebSocket is connected but we think we're offline? Re-check!
      console.log('WebSocket connected but showing offline - rechecking');
      recheckConnection();
    }
  }, [wsConnected, connectionQuality, recheckConnection]);

  // Cleanup ping interval on unmount
  useEffect(() => {
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, []);

  return {
    connectionQuality,
    bandwidth,
    audioOutputStatus,
    pingLatency,
    lastPingTime,
    recheckConnection,
    recheckAudioOutput,
    startPingInterval,
    stopPingInterval,
  };
}
