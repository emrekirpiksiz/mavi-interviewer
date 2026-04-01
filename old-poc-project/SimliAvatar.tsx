import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { SimliClient } from 'simli-client';

interface SimliAvatarProps {
  apiKey: string;
  faceId?: string;
  onReady?: () => void;
  onError?: (error: string) => void;
}

export interface SimliAvatarRef {
  sendAudioData: (audioData: Uint8Array) => void;
  start: () => Promise<void>;
  close: () => void;
  isReady: () => boolean;
}

export const SimliAvatar = forwardRef<SimliAvatarRef, SimliAvatarProps>(
  ({ apiKey, faceId = 'cace3ef7-a4c4-425d-a8cf-a5358eb0c427', onReady, onError }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const clientRef = useRef<SimliClient | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isStarted, setIsStarted] = useState(false);
    const initializingRef = useRef(false);

    useEffect(() => {
      if (!apiKey || !videoRef.current || !audioRef.current) return;
      if (isInitialized || initializingRef.current) return;

      initializingRef.current = true;

      const initSimli = async () => {
        try {
          const client = new SimliClient();
          clientRef.current = client;

          // SimliClient beklediği config formatı (faceID büyük harfle!)
          const config = {
            apiKey: apiKey,
            faceID: faceId, // faceID büyük harfle!
            handleSilence: true,
            maxSessionLength: 3600,
            maxIdleTime: 600,
            session_token: '',
            videoRef: videoRef.current!,
            audioRef: audioRef.current!,
            enableConsoleLogs: true,
            SimliURL: '',
            maxRetryAttempts: 3,
            retryDelay_ms: 2000,
            videoReceivedTimeout: 15000,
            enableSFU: true,
            model: '' as const,
          };

          console.log('Simli: Initializing with faceID:', faceId);
          client.Initialize(config);
          setIsInitialized(true);
          console.log('Simli: Initialized successfully');
          
          // Event listeners
          client.on('connected', () => {
            console.log('Simli: Connected event received');
            setIsStarted(true);
          });
          
          client.on('disconnected', () => {
            console.log('Simli: Disconnected event received');
            setIsStarted(false);
          });
          
          client.on('failed', (reason) => {
            console.error('Simli: Failed event:', reason);
            onError?.(`Simli bağlantı hatası: ${reason}`);
          });
          
          // Speaking/Silent events - lip-sync durumu
          client.on('speaking', () => {
            console.log('Simli: Avatar SPEAKING - lip-sync active');
          });
          
          client.on('silent', () => {
            console.log('Simli: Avatar SILENT - lip-sync stopped');
          });

          // Start connection
          console.log('Simli: Starting WebRTC connection...');
          await client.start();
          console.log('Simli: WebRTC connection started');
          
          onReady?.();
        } catch (error) {
          console.error('Simli init/start error:', error);
          initializingRef.current = false;
          onError?.(error instanceof Error ? error.message : 'Simli başlatılamadı');
        }
      };

      initSimli();

      return () => {
        if (clientRef.current) {
          clientRef.current.close();
          setIsInitialized(false);
          setIsStarted(false);
          initializingRef.current = false;
        }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiKey, faceId]);

    useImperativeHandle(ref, () => ({
      sendAudioData: (audioData: Uint8Array) => {
        const client = clientRef.current;
        if (client) {
          // Client'ın isConnected metodunu kontrol et
          const isConnected = client.isConnected?.() ?? false;
          console.log('Simli: sendAudioData called, isConnected:', isConnected, 'length:', audioData.length);
          if (isConnected) {
            client.sendAudioData(audioData);
          } else {
            console.warn('Simli: Cannot send audio, not connected');
          }
        } else {
          console.warn('Simli: No client available');
        }
      },
      start: async () => {
        if (clientRef.current) {
          await clientRef.current.start();
          setIsStarted(true);
          console.log('Simli: Started via ref');
        }
      },
      close: () => {
        if (clientRef.current) {
          clientRef.current.close();
          setIsInitialized(false);
          setIsStarted(false);
          initializingRef.current = false;
        }
      },
      isReady: () => {
        // Client'ın isConnected metodunu kontrol et
        const client = clientRef.current;
        if (client && typeof client.isConnected === 'function') {
          return client.isConnected();
        }
        return isStarted;
      },
    }), [isInitialized, isStarted]);

    return (
      <div className="relative w-full h-full rounded-xl overflow-hidden bg-slate-900">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={false}
          className="w-full h-full object-cover"
        />
        <audio ref={audioRef} autoPlay />
        
        {/* Status overlay */}
        {!isStarted && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800/90">
            <div className="text-center">
              <div className="text-4xl mb-2 animate-pulse">👤</div>
              <p className="text-slate-400 text-sm">
                {isInitialized ? 'Avatar başlatılıyor...' : 'Avatar yükleniyor...'}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }
);

SimliAvatar.displayName = 'SimliAvatar';
