'use client';

import { useState, useCallback, useRef } from 'react';
import { useInterviewStore } from '@/stores/interviewStore';
import { useNetworkCheck } from '@/hooks/useNetworkCheck';
import { 
  Play, 
  Mic, 
  Camera,
  Headphones, 
  Wifi, 
  WifiOff,
  Check, 
  X, 
  AlertCircle,
  Info,
  Shield,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  Sparkles,
  MessageSquare,
  Clock,
  HelpCircle,
  RefreshCcw,
  Volume2,
  Square,
  CheckCircle2,
} from 'lucide-react';

interface ReadyScreenProps {
  onStart: () => void;
  onMicPermissionRequest: () => Promise<boolean>;
  onCameraPermissionRequest?: () => Promise<boolean>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const KVKK_TEXT = `6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında, yapay zeka destekli bu mülakat sürecinde kişisel verileriniz (ses kaydı, görüntü kaydı ve mülakat yanıtları) işlenecektir.

Toplanan Veriler:
• Ses kaydınız (konuşma içeriği)
• Görüntü kaydınız (kamera etkinleştirilmişse)
• Mülakat yanıtlarınız
• Oturum süre bilgisi

Verilerin İşlenme Amacı:
• İşe alım sürecinin yürütülmesi
• Mülakat değerlendirmesi
• Aday kimlik doğrulaması ve görüşme bütünlüğü kontrolü
• Aday havuzu oluşturulması

Verileriniz yalnızca işe alım süreci kapsamında kullanılacak ve yasal saklama süreleri sonunda silinecektir. KVKK kapsamındaki haklarınızı (erişim, düzeltme, silme vb.) kullanmak için işveren şirket ile iletişime geçebilirsiniz.

Bu onay kutusunu işaretleyerek, yukarıda belirtilen şartları okuduğunuzu ve kişisel verilerinizin işlenmesine açık rıza verdiğinizi kabul etmiş olursunuz.`;

const TEST_SENTENCE = 'Merhaba, görüşmeye hazırım.';

export function ReadyScreen({ onStart, onMicPermissionRequest, onCameraPermissionRequest }: ReadyScreenProps) {
  const session = useInterviewStore((state) => state.session);
  const setPageState = useInterviewStore((state) => state.setPageState);
  const kvkkAccepted = useInterviewStore((state) => state.kvkkAccepted);
  const setKvkkAccepted = useInterviewStore((state) => state.setKvkkAccepted);
  const micPermission = useInterviewStore((state) => state.micPermission);
  const setMicPermission = useInterviewStore((state) => state.setMicPermission);
  const wsConnected = useInterviewStore((state) => state.wsConnected);
  const cameraEnabled = useInterviewStore((state) => state.cameraEnabled);
  const cameraPermission = useInterviewStore((state) => state.cameraPermission);
  const setCameraPermission = useInterviewStore((state) => state.setCameraPermission);

  const { 
    connectionQuality, 
    bandwidth, 
    audioOutputStatus,
    recheckConnection,
    recheckAudioOutput
  } = useNetworkCheck();

  // Local state
  const [kvkkExpanded, setKvkkExpanded] = useState(false);
  const [micChecking, setMicChecking] = useState(false);
  const [cameraChecking, setCameraChecking] = useState(false);

  // Audio test state
  const [audioTestState, setAudioTestState] = useState<'idle' | 'playing' | 'done'>('idle');
  const [audioConfirmed, setAudioConfirmed] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  // Mic test state
  const [micTestState, setMicTestState] = useState<'idle' | 'recording' | 'processing' | 'done' | 'error'>('idle');
  const [micTestResult, setMicTestResult] = useState<string | null>(null);
  const [micTestConfirmed, setMicTestConfirmed] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const micTestTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Headphone acknowledgement
  const [headphoneAck, setHeadphoneAck] = useState(false);

  // Request microphone permission
  const handleMicRequest = useCallback(async () => {
    setMicChecking(true);
    try {
      const granted = await onMicPermissionRequest();
      setMicPermission(granted ? 'granted' : 'denied');
    } catch {
      setMicPermission('denied');
    } finally {
      setMicChecking(false);
    }
  }, [onMicPermissionRequest, setMicPermission]);

  // Request camera permission
  const handleCameraRequest = useCallback(async () => {
    if (!onCameraPermissionRequest) return;
    setCameraChecking(true);
    try {
      const granted = await onCameraPermissionRequest();
      setCameraPermission(granted ? 'granted' : 'denied');
    } catch {
      setCameraPermission('denied');
    } finally {
      setCameraChecking(false);
    }
  }, [onCameraPermissionRequest, setCameraPermission]);

  // --- Audio Test: play a short beep tone ---
  const playTestSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioRef.current = ctx;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      oscRef.current = osc;
      setAudioTestState('playing');

      setTimeout(() => {
        osc.stop();
        ctx.close();
        oscRef.current = null;
        audioRef.current = null;
        setAudioTestState('done');
      }, 1500);
    } catch {
      setAudioTestState('done');
    }
  }, []);

  const stopTestSound = useCallback(() => {
    if (oscRef.current) { try { oscRef.current.stop(); } catch { /* */ } }
    if (audioRef.current) { try { audioRef.current.close(); } catch { /* */ } }
    oscRef.current = null;
    audioRef.current = null;
    setAudioTestState('done');
  }, []);

  // --- Mic Test: record 3s, send to Whisper ---
  const startMicTest = useCallback(async () => {
    if (micPermission !== 'granted') {
      await handleMicRequest();
      if (useInterviewStore.getState().micPermission !== 'granted') return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setMicTestState('processing');

        const blob = new Blob(chunksRef.current, { type: mimeType });
        const formData = new FormData();
        formData.append('audio', blob, 'mic-test.webm');
        formData.append('language', 'tr');
        formData.append('prompt', `Kullanıcı test cümlesi söylüyor: "${TEST_SENTENCE}"`);

        try {
          const res = await fetch(`${API_URL}/transcribe`, { method: 'POST', body: formData });
          const data = await res.json();
          if (data.success && data.text && data.text.trim().length > 0) {
            setMicTestResult(data.text);
            setMicTestState('done');
          } else {
            setMicTestResult(null);
            setMicTestState('error');
          }
        } catch {
          setMicTestResult(null);
          setMicTestState('error');
        }
      };

      recorder.start();
      setMicTestState('recording');

      micTestTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 4000);
    } catch {
      setMicTestState('error');
    }
  }, [micPermission, handleMicRequest]);

  const resetMicTest = useCallback(() => {
    if (micTestTimerRef.current) clearTimeout(micTestTimerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    setMicTestState('idle');
    setMicTestResult(null);
    setMicTestConfirmed(false);
  }, []);

  // All checks
  const cameraCheckPassed = !cameraEnabled || cameraPermission === 'granted';
  const systemChecksPassed = 
    micPermission === 'granted' && 
    cameraCheckPassed &&
    wsConnected && 
    connectionQuality !== 'offline' && 
    connectionQuality !== 'checking' &&
    audioOutputStatus === 'available';

  const allTestsPassed = audioConfirmed && micTestConfirmed && headphoneAck;
  const canStart = kvkkAccepted && systemChecksPassed && allTestsPassed;

  const handleStart = () => {
    if (!canStart) return;
    setPageState('active');
  };

  const getBandwidthDisplay = () => {
    if (connectionQuality === 'checking') return { text: 'Kontrol ediliyor...', status: 'loading' as const };
    if (connectionQuality === 'offline') return { text: 'Bağlantı yok', status: 'error' as const };
    if (connectionQuality === 'poor') return { text: `Zayıf (${bandwidth?.toFixed(1) || '?'} Mbps)`, status: 'warning' as const };
    if (connectionQuality === 'good') return { text: `İyi (${bandwidth?.toFixed(1) || '?'} Mbps)`, status: 'success' as const };
    return { text: `Mükemmel (${bandwidth?.toFixed(1) || '?'} Mbps)`, status: 'success' as const };
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* ==================== HEADER ==================== */}
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-muted)] flex items-center justify-center shadow-lg shadow-[var(--accent-primary)]/20">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">
              Merhaba{session?.candidateName ? `, ${session.candidateName}` : ''}!
            </h1>
            <p className="text-[var(--text-secondary)] mt-2 text-lg">
              AI destekli mülakata hoş geldiniz
            </p>
          </div>
        </div>

        {/* ==================== POSITION INFO ==================== */}
        <div className="bg-gradient-to-r from-[var(--bg-secondary)] to-[var(--bg-tertiary)] rounded-xl p-5 border border-[var(--border-default)]">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-[var(--accent-primary)]/10 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-6 h-6 text-[var(--accent-primary)]" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                {session?.positionTitle || 'Pozisyon'}
              </h2>
              <p className="text-[var(--text-secondary)]">
                {session?.companyName || 'Şirket'}
              </p>
              <div className="flex items-center gap-2 mt-2 text-[var(--text-muted)] text-sm">
                <Clock className="w-4 h-4" />
                <span>Tahmini süre: 15-20 dakika</span>
              </div>
            </div>
          </div>
        </div>

        {/* ==================== SYSTEM CHECKS (auto) ==================== */}
        <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-default)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-default)]">
            <h3 className="text-[var(--text-primary)] font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-[var(--accent-primary)]" />
              Sistem Kontrolleri
            </h3>
          </div>
          <div className="p-4 space-y-3">
            {micPermission === 'pending' && !micChecking ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--accent-primary)]/10 flex items-center justify-center">
                    <Mic className="w-5 h-5 text-[var(--accent-primary)]" />
                  </div>
                  <div>
                    <p className="text-[var(--text-primary)] font-medium">Mikrofon İzni</p>
                    <p className="text-sm text-[var(--text-muted)]">İzin bekleniyor</p>
                  </div>
                </div>
                <button onClick={handleMicRequest} className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-lg transition-colors">
                  Mikrofon İzni Ver
                </button>
              </div>
            ) : (
              <SystemCheckItem icon={Mic} label="Mikrofon İzni"
                status={micChecking ? 'loading' : micPermission === 'granted' ? 'success' : micPermission === 'denied' ? 'error' : 'loading'}
                statusText={micChecking ? 'Kontrol ediliyor...' : micPermission === 'granted' ? 'İzin verildi' : micPermission === 'denied' ? 'İzin reddedildi' : 'Bekleniyor...'}
                onRetry={micPermission === 'denied' ? handleMicRequest : undefined}
              />
            )}
            {cameraEnabled && (
              cameraPermission === 'pending' && !cameraChecking ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-tertiary)]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--accent-primary)]/10 flex items-center justify-center">
                      <Camera className="w-5 h-5 text-[var(--accent-primary)]" />
                    </div>
                    <div>
                      <p className="text-[var(--text-primary)] font-medium">Kamera İzni</p>
                      <p className="text-sm text-[var(--text-muted)]">İzin bekleniyor</p>
                    </div>
                  </div>
                  <button onClick={handleCameraRequest} className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-lg transition-colors">
                    Kamera İzni Ver
                  </button>
                </div>
              ) : (
                <SystemCheckItem icon={Camera} label="Kamera İzni"
                  status={cameraChecking ? 'loading' : cameraPermission === 'granted' ? 'success' : cameraPermission === 'denied' ? 'error' : 'loading'}
                  statusText={cameraChecking ? 'Kontrol ediliyor...' : cameraPermission === 'granted' ? 'İzin verildi' : cameraPermission === 'denied' ? 'İzin reddedildi' : 'Bekleniyor...'}
                  onRetry={cameraPermission === 'denied' ? handleCameraRequest : undefined}
                />
              )
            )}
            <SystemCheckItem icon={Headphones} label="Ses Çıkışı"
              status={audioOutputStatus === 'checking' ? 'loading' : audioOutputStatus === 'available' ? 'success' : 'error'}
              statusText={audioOutputStatus === 'checking' ? 'Kontrol ediliyor...' : audioOutputStatus === 'available' ? 'Kulaklık/Hoparlör hazır' : 'Ses çıkışı bulunamadı'}
              onRetry={audioOutputStatus === 'unavailable' ? recheckAudioOutput : undefined}
            />
            <SystemCheckItem icon={connectionQuality === 'offline' ? WifiOff : Wifi} label="İnternet Bağlantısı"
              status={getBandwidthDisplay().status} statusText={getBandwidthDisplay().text}
              onRetry={connectionQuality !== 'checking' ? recheckConnection : undefined}
            />
            <SystemCheckItem icon={Wifi} label="Sunucu Bağlantısı"
              status={wsConnected ? 'success' : 'loading'}
              statusText={wsConnected ? 'Bağlı' : 'Bağlanıyor...'}
            />
          </div>
          {connectionQuality === 'poor' && (
            <div className="mx-4 mb-4 p-3 bg-[var(--warning)]/10 border border-[var(--warning)]/30 rounded-lg">
              <p className="text-[var(--warning)] text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Bağlantınız zayıf. Görüşme sırasında kesintiler yaşayabilirsiniz.</span>
              </p>
            </div>
          )}
        </div>

        {/* ==================== AUDIO & MIC TESTS ==================== */}
        <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-default)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-default)]">
            <h3 className="text-[var(--text-primary)] font-semibold flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-[var(--accent-primary)]" />
              Ses & Mikrofon Testi
            </h3>
            <p className="text-[var(--text-muted)] text-sm mt-1">
              Görüşme öncesi ses ve mikrofon doğrulaması
            </p>
          </div>

          <div className="p-4 space-y-4">
            {/* 1. Audio Output Test */}
            <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${audioConfirmed ? 'bg-[var(--success)]/10' : 'bg-[var(--accent-primary)]/10'}`}>
                    <Volume2 className={`w-5 h-5 ${audioConfirmed ? 'text-[var(--success)]' : 'text-[var(--accent-primary)]'}`} />
                  </div>
                  <div>
                    <p className="text-[var(--text-primary)] font-medium">Adım 1: Ses Testi</p>
                    <p className="text-[var(--text-muted)] text-sm">Örnek sesi dinleyin ve duyduğunuzu onaylayın</p>
                  </div>
                </div>
                {audioConfirmed && <CheckCircle2 className="w-5 h-5 text-[var(--success)]" />}
              </div>

              {!audioConfirmed && (
                <div className="ml-[52px] space-y-3">
                  <div className="flex items-center gap-3">
                    {audioTestState === 'idle' && (
                      <button onClick={playTestSound} className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-lg transition-colors">
                        <Play className="w-4 h-4" /> Sesi Çal
                      </button>
                    )}
                    {audioTestState === 'playing' && (
                      <button onClick={stopTestSound} className="flex items-center gap-2 px-4 py-2 bg-[var(--warning)] text-white text-sm font-medium rounded-lg animate-pulse">
                        <Square className="w-4 h-4" /> Çalıyor...
                      </button>
                    )}
                    {audioTestState === 'done' && (
                      <>
                        <button onClick={playTestSound} className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] text-sm rounded-lg transition-colors">
                          <RefreshCw className="w-4 h-4" /> Tekrar Çal
                        </button>
                        <button onClick={() => setAudioConfirmed(true)} className="flex items-center gap-2 px-4 py-2 bg-[var(--success)] hover:bg-[var(--success)]/80 text-white text-sm font-medium rounded-lg transition-colors">
                          <Check className="w-4 h-4" /> Sesi Duydum
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Microphone Test */}
            <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${micTestConfirmed ? 'bg-[var(--success)]/10' : 'bg-[var(--accent-primary)]/10'}`}>
                    <Mic className={`w-5 h-5 ${micTestConfirmed ? 'text-[var(--success)]' : 'text-[var(--accent-primary)]'}`} />
                  </div>
                  <div>
                    <p className="text-[var(--text-primary)] font-medium">Adım 2: Mikrofon Testi</p>
                    <p className="text-[var(--text-muted)] text-sm">Kısa bir cümle söyleyin, doğru algılandığını onaylayın</p>
                  </div>
                </div>
                {micTestConfirmed && <CheckCircle2 className="w-5 h-5 text-[var(--success)]" />}
              </div>

              {!micTestConfirmed && (
                <div className="ml-[52px] space-y-3">
                  {micPermission !== 'granted' && (
                    <p className="text-[var(--text-muted)] text-sm">Önce mikrofon izni verin.</p>
                  )}

                  {micPermission === 'granted' && micTestState === 'idle' && (
                    <div>
                      <p className="text-[var(--text-muted)] text-sm mb-2">
                        Butona basın ve şunu söyleyin: <span className="text-[var(--text-primary)] font-medium">&quot;{TEST_SENTENCE}&quot;</span>
                      </p>
                      <button onClick={startMicTest} className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-lg transition-colors">
                        <Mic className="w-4 h-4" /> Kayda Başla
                      </button>
                    </div>
                  )}

                  {micTestState === 'recording' && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 px-4 py-2 bg-[var(--error)] text-white text-sm font-medium rounded-lg animate-pulse">
                        <div className="w-3 h-3 bg-white rounded-full animate-ping" />
                        Dinleniyor... Konuşun
                      </div>
                    </div>
                  )}

                  {micTestState === 'processing' && (
                    <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sesiniz işleniyor...
                    </div>
                  )}

                  {micTestState === 'done' && micTestResult && (
                    <div className="space-y-2">
                      <div className="p-3 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-default)]">
                        <p className="text-xs text-[var(--text-muted)] mb-1">Algılanan:</p>
                        <p className="text-[var(--text-primary)] font-medium">&quot;{micTestResult}&quot;</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={resetMicTest} className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] text-sm rounded-lg transition-colors">
                          <RefreshCw className="w-4 h-4" /> Tekrar Dene
                        </button>
                        <button onClick={() => setMicTestConfirmed(true)} className="flex items-center gap-2 px-4 py-2 bg-[var(--success)] hover:bg-[var(--success)]/80 text-white text-sm font-medium rounded-lg transition-colors">
                          <Check className="w-4 h-4" /> Doğru Algılandı
                        </button>
                      </div>
                    </div>
                  )}

                  {micTestState === 'error' && (
                    <div className="space-y-2">
                      <p className="text-[var(--error)] text-sm">Ses algılanamadı. Lütfen tekrar deneyin.</p>
                      <button onClick={resetMicTest} className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-lg transition-colors">
                        <RefreshCw className="w-4 h-4" /> Tekrar Dene
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ==================== AI INFO ==================== */}
        <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-default)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-default)]">
            <h3 className="text-[var(--text-primary)] font-semibold flex items-center gap-2">
              <Info className="w-5 h-5 text-[var(--accent-primary)]" />
              AI Görüşme Hakkında
            </h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-3 text-[var(--text-secondary)] text-sm">
              <InfoItem icon={Sparkles} title="Yapay Zeka ile Görüşme" description="Bu görüşme, yapay zeka destekli bir asistan tarafından gerçekleştirilmektedir. Sorular pozisyona özel olarak hazırlanmıştır." />
              <InfoItem icon={Mic} title="Sıra Tabanlı Görüşme" description="Görüşme sıra tabanlıdır. AI soru sorar, siz dinlersiniz. Sıra size geçtiğinde mikrofon butonu aktif olur. Konuşmanızı bitirdiğinizde Gönder butonuna basarsınız." />
              <InfoItem icon={Clock} title="Süre" description="Görüşme ortalama 15-20 dakika sürmektedir. İstediğiniz zaman görüşmeyi sonlandırabilirsiniz." />
            </div>

            <div className="mt-4 p-4 bg-[var(--bg-tertiary)] rounded-lg">
              <h4 className="text-[var(--text-primary)] font-medium flex items-center gap-2 mb-3">
                <RefreshCcw className="w-4 h-4 text-[var(--accent-primary)]" />
                Görüşme Nasıl İlerler?
              </h4>
              <ol className="space-y-2 text-[var(--text-muted)] text-sm list-decimal list-inside">
                <li>AI mülakatçı size soru soracak &rarr; <span className="text-blue-400 font-medium">&quot;SIRA AI&apos;DA&quot;</span> göstergesi</li>
                <li>Soru bittikten sonra mikrofon aktif olacak &rarr; <span className="text-green-400 font-medium">&quot;SIRA SİZDE&quot;</span> göstergesi</li>
                <li>Konuşmanızı bitirdikten sonra <span className="text-[var(--text-primary)] font-medium">&quot;Gönder&quot;</span> butonuna basın</li>
                <li>AI yanıtınızı değerlendirip yeni soru soracak</li>
                <li>Bu döngü görüşme sonuna kadar devam eder</li>
              </ol>
            </div>

            <div className="mt-4 p-4 bg-[var(--bg-tertiary)] rounded-lg">
              <h4 className="text-[var(--text-primary)] font-medium flex items-center gap-2 mb-3">
                <HelpCircle className="w-4 h-4 text-[var(--accent-primary)]" />
                Sorun Yaşarsanız
              </h4>
              <ul className="space-y-2 text-[var(--text-muted)] text-sm">
                <li className="flex items-start gap-2"><span className="text-[var(--accent-primary)]">•</span><span><strong>Ses duyamıyorsanız:</strong> Kulaklık/hoparlör bağlantınızı ve ses seviyesini kontrol edin.</span></li>
                <li className="flex items-start gap-2"><span className="text-[var(--accent-primary)]">•</span><span><strong>Mikrofon çalışmıyorsa:</strong> Tarayıcı izinlerini kontrol edin ve sayfayı yenileyin.</span></li>
                <li className="flex items-start gap-2"><span className="text-[var(--accent-primary)]">•</span><span><strong>Bağlantı kesilirse:</strong> Sayfa otomatik olarak yeniden bağlanmaya çalışacaktır.</span></li>
              </ul>
            </div>
          </div>
        </div>

        {/* ==================== KVKK ==================== */}
        <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-default)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-default)] cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors" onClick={() => setKvkkExpanded(!kvkkExpanded)}>
            <div className="flex items-center justify-between">
              <h3 className="text-[var(--text-primary)] font-semibold flex items-center gap-2">
                <Shield className="w-5 h-5 text-[var(--accent-primary)]" />
                KVKK Aydınlatma Metni ve Açık Rıza
              </h3>
              {kvkkExpanded ? <ChevronUp className="w-5 h-5 text-[var(--text-muted)]" /> : <ChevronDown className="w-5 h-5 text-[var(--text-muted)]" />}
            </div>
          </div>
          <div className={`transition-all duration-300 overflow-hidden ${kvkkExpanded ? 'max-h-96' : 'max-h-0'}`}>
            <div className="p-5 max-h-80 overflow-y-auto">
              <p className="text-[var(--text-secondary)] text-sm whitespace-pre-line leading-relaxed">{KVKK_TEXT}</p>
            </div>
          </div>
          <div className="px-5 py-4 bg-[var(--bg-tertiary)]">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex-shrink-0 mt-0.5">
                <input type="checkbox" checked={kvkkAccepted} onChange={(e) => setKvkkAccepted(e.target.checked)} className="sr-only" />
                <div className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${kvkkAccepted ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)]' : 'border-[var(--border-default)] group-hover:border-[var(--accent-primary)]'}`}>
                  {kvkkAccepted && <Check className="w-3 h-3 text-white" />}
                </div>
              </div>
              <span className="text-[var(--text-secondary)] text-sm leading-relaxed">
                KVKK Aydınlatma Metni'ni okudum ve kişisel verilerimin işlenmesine açık rıza veriyorum.
                <button type="button" onClick={(e) => { e.preventDefault(); setKvkkExpanded(true); }} className="text-[var(--accent-primary)] hover:underline ml-1">(Metni oku)</button>
              </span>
            </label>
          </div>
        </div>

        {/* ==================== HEADPHONE ACK ==================== */}
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <div className="flex items-start gap-3">
            <Headphones className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-300 text-sm font-medium">Kulaklık Kullanmanızı Öneriyoruz</p>
              <p className="text-blue-300/70 text-xs mt-1">Görüşme sırasında en iyi ses kalitesi ve karşılıklı anlama için kulaklık kullanmanız tavsiye edilir.</p>
            </div>
          </div>
          <label className="flex items-center gap-2 mt-3 ml-8 cursor-pointer">
            <CustomCheckbox checked={headphoneAck} onChange={setHeadphoneAck} />
            <span className="text-blue-300/80 text-sm">Kulaklığım takılı veya sesimi net duyabiliyorum.</span>
          </label>
        </div>

        {/* ==================== START BUTTON ==================== */}
        <div className="pt-2">
          <button onClick={handleStart} disabled={!canStart}
            className={`w-full py-4 rounded-xl font-semibold text-lg transition-all duration-200 flex items-center justify-center gap-3 ${canStart ? 'bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-muted)] text-white hover:shadow-lg hover:shadow-[var(--accent-primary)]/30 hover:scale-[1.02]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'}`}
          >
            <Play className="w-6 h-6" />
            Görüşmeye Başla
          </button>

          {!canStart && (
            <p className="text-center text-[var(--text-muted)] text-sm mt-3">
              {!systemChecksPassed 
                ? 'Lütfen sistem kontrollerinin tamamlanmasını bekleyin.'
                : !allTestsPassed
                  ? 'Lütfen ses ve mikrofon testlerini tamamlayın.'
                  : !kvkkAccepted 
                    ? 'Devam etmek için KVKK onayı vermeniz gerekmektedir.'
                    : 'Hazırlanıyor...'
              }
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== HELPER COMPONENTS ====================

function CustomCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${checked ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)]' : 'border-[var(--border-default)] hover:border-[var(--accent-primary)]'}`}
    >
      {checked && <Check className="w-3 h-3 text-white" />}
    </button>
  );
}

interface SystemCheckItemProps {
  icon: React.ElementType;
  label: string;
  status: 'success' | 'error' | 'warning' | 'loading';
  statusText: string;
  onRetry?: () => void;
}

function SystemCheckItem({ icon: Icon, label, status, statusText, onRetry }: SystemCheckItemProps) {
  const { icon: StatusIcon, color, bg } = getCheckStatusConfig(status);
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-tertiary)]">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <p className="text-[var(--text-primary)] font-medium">{label}</p>
          <p className={`text-sm ${color}`}>{statusText}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {status === 'loading' ? <Loader2 className={`w-5 h-5 ${color} animate-spin`} /> : <StatusIcon className={`w-5 h-5 ${color}`} />}
        {onRetry && status !== 'loading' && (
          <button onClick={onRetry} className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors" title="Tekrar dene">
            <RefreshCw className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        )}
      </div>
    </div>
  );
}

function getCheckStatusConfig(status: 'success' | 'error' | 'warning' | 'loading') {
  switch (status) {
    case 'success': return { icon: Check, color: 'text-[var(--success)]', bg: 'bg-[var(--success)]/10' };
    case 'error': return { icon: X, color: 'text-[var(--error)]', bg: 'bg-[var(--error)]/10' };
    case 'warning': return { icon: AlertCircle, color: 'text-[var(--warning)]', bg: 'bg-[var(--warning)]/10' };
    case 'loading': return { icon: Loader2, color: 'text-[var(--accent-primary)]', bg: 'bg-[var(--accent-primary)]/10' };
  }
}

interface InfoItemProps { icon: React.ElementType; title: string; description: string; }

function InfoItem({ icon: Icon, title, description }: InfoItemProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-[var(--accent-primary)]" />
      </div>
      <div>
        <h4 className="text-[var(--text-primary)] font-medium">{title}</h4>
        <p className="text-[var(--text-muted)] mt-0.5">{description}</p>
      </div>
    </div>
  );
}
