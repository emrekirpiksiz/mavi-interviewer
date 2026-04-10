'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useInterviewStore } from '@/stores/interviewStore';
import { useNetworkCheck } from '@/hooks/useNetworkCheck';
import Image from 'next/image';
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
  AlertTriangle,
  Info,
  Shield,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  MessageSquare,
  Clock,
  HelpCircle,
  RefreshCcw,
  CheckCircle2,
} from 'lucide-react';

interface ReadyScreenProps {
  onStart: () => void;
  onMicPermissionRequest: () => Promise<boolean>;
  onCameraPermissionRequest?: () => Promise<boolean>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:2223';

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

  // Camera preview state
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement>(null);

  // Audio level state
  const [audioLevel, setAudioLevel] = useState(0);
  const [hasSpeech, setHasSpeech] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Headphone acknowledgement
  const [headphoneAck, setHeadphoneAck] = useState(false);

  // Request microphone permission and start level monitoring
  const handleMicRequest = useCallback(async () => {
    setMicChecking(true);
    try {
      const granted = await onMicPermissionRequest();
      setMicPermission(granted ? 'granted' : 'denied');

      if (granted) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;

        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const poll = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]!;
          const avg = sum / dataArray.length;
          const normalized = Math.min(avg / 80, 1);
          setAudioLevel(normalized);
          if (normalized > 0.15) setHasSpeech(true);
          animationFrameRef.current = requestAnimationFrame(poll);
        };
        poll();
      }
    } catch {
      setMicPermission('denied');
    } finally {
      setMicChecking(false);
    }
  }, [onMicPermissionRequest, setMicPermission]);

  // Request camera permission and start preview
  const handleCameraRequest = useCallback(async () => {
    if (!onCameraPermissionRequest) return;
    setCameraChecking(true);
    try {
      const granted = await onCameraPermissionRequest();
      setCameraPermission(granted ? 'granted' : 'denied');

      if (granted) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setCameraStream(stream);
      }
    } catch {
      setCameraPermission('denied');
    } finally {
      setCameraChecking(false);
    }
  }, [onCameraPermissionRequest, setCameraPermission]);

  // Attach camera stream to video element
  useEffect(() => {
    if (cameraPreviewRef.current && cameraStream) {
      cameraPreviewRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
    };
  }, [cameraStream]);

  // All checks
  const cameraCheckPassed = !cameraEnabled || cameraPermission === 'granted';
  const systemChecksPassed = 
    micPermission === 'granted' && 
    cameraCheckPassed &&
    wsConnected && 
    connectionQuality !== 'offline' && 
    connectionQuality !== 'checking' &&
    audioOutputStatus === 'available';

  const canStart = kvkkAccepted && systemChecksPassed && hasSpeech && headphoneAck;

  const handleStart = () => {
    if (!canStart) return;
    // Cleanup preview streams before navigating
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
    if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
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
    <div className="min-h-screen bg-[var(--bg-primary)] py-6 sm:py-8 px-4 pb-safe">
      <div className="max-w-2xl mx-auto space-y-5 sm:space-y-6">
        
        {/* ==================== POC BANNER ==================== */}
        <div className="flex items-start gap-3 p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-amber-300/90 text-xs sm:text-sm leading-relaxed">
            Bu uygulama <span className="font-semibold text-amber-300">POC modundadır.</span> Uygulamanın POC versiyonunu görüntülüyorsunuz.
          </p>
        </div>

        {/* ==================== HEADER WITH LOGO ==================== */}
        <div className="text-center space-y-5 sm:space-y-6">
          <div className="flex flex-col items-center gap-4">
            <Image
              src="/mavi_logo.png"
              alt="Mavi Logo"
              width={120}
              height={120}
              className="rounded-2xl"
            />
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Mavi Avatar Uygulaması
            </h2>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
              Merhaba{session?.candidateName ? `, ${session.candidateName}` : ''}!
            </h1>
            <p className="text-[var(--text-secondary)] mt-1.5 sm:mt-2 text-base sm:text-lg">
              Görüşmeye hoş geldiniz
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
                {session?.assessmentTitle || 'Değerlendirme'}
              </h2>
              <p className="text-[var(--text-secondary)]">
                {session?.totalQuestions ? `${session.totalQuestions} soru` : ''}
              </p>
              <div className="flex items-center gap-2 mt-2 text-[var(--text-muted)] text-sm">
                <Clock className="w-4 h-4" />
                <span>Tahmini süre: 10-15 dakika</span>
              </div>
            </div>
          </div>
        </div>

        {/* ==================== SYSTEM CHECKS + LIVE PREVIEW ==================== */}
        <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-default)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-default)]">
            <h3 className="text-[var(--text-primary)] font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-[var(--accent-primary)]" />
              Sistem Kontrolleri
            </h3>
            <p className="text-[var(--text-muted)] text-sm mt-1">
              Kamera ve mikrofon izinlerini verin, ardından konuşarak ses çubuğunun hareket ettiğini doğrulayın.
            </p>
          </div>

          <div className="p-4 space-y-4">
            {/* Camera + Mic live preview area */}
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Camera preview */}
              <div className="flex-1">
                <div className="relative w-full aspect-video rounded-lg bg-[var(--bg-tertiary)] overflow-hidden border border-[var(--border-default)]">
                  {cameraPermission === 'granted' && cameraStream ? (
                    <video
                      ref={cameraPreviewRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover mirror"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full h-full gap-3 p-4">
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                        cameraPermission === 'denied' ? 'bg-[var(--error)]/10' : 'bg-[var(--bg-secondary)]'
                      }`}>
                        <Camera className={`w-7 h-7 ${
                          cameraPermission === 'denied' ? 'text-[var(--error)]' : 'text-[var(--text-muted)]'
                        }`} />
                      </div>
                      {cameraPermission === 'denied' ? (
                        <p className="text-[var(--error)] text-sm text-center">Kamera izni reddedildi</p>
                      ) : (
                        <button
                          onClick={handleCameraRequest}
                          disabled={cameraChecking}
                          className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          {cameraChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                          Kamera İzni Ver
                        </button>
                      )}
                    </div>
                  )}
                  {/* Camera status badge */}
                  {cameraPermission === 'granted' && (
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-md">
                      <div className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
                      <span className="text-xs text-white/80">Kamera aktif</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right column: mic + audio level */}
              <div className="flex-1 flex flex-col gap-4">
                {/* Microphone permission + level */}
                <div className="flex-1 p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-default)] flex flex-col">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      micPermission === 'granted' ? 'bg-[var(--success)]/10' : micPermission === 'denied' ? 'bg-[var(--error)]/10' : 'bg-[var(--accent-primary)]/10'
                    }`}>
                      <Mic className={`w-5 h-5 ${
                        micPermission === 'granted' ? 'text-[var(--success)]' : micPermission === 'denied' ? 'text-[var(--error)]' : 'text-[var(--accent-primary)]'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[var(--text-primary)] font-medium text-sm">Mikrofon</p>
                      <p className={`text-xs ${
                        micPermission === 'granted' ? 'text-[var(--success)]' : micPermission === 'denied' ? 'text-[var(--error)]' : 'text-[var(--text-muted)]'
                      }`}>
                        {micPermission === 'granted' ? 'İzin verildi' : micPermission === 'denied' ? 'İzin reddedildi' : 'Bekleniyor'}
                      </p>
                    </div>
                    {micPermission === 'granted' && <Check className="w-5 h-5 text-[var(--success)]" />}
                  </div>

                  {micPermission !== 'granted' ? (
                    <button
                      onClick={handleMicRequest}
                      disabled={micChecking}
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {micChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                      Mikrofon İzni Ver
                    </button>
                  ) : (
                    <div className="flex-1 flex flex-col justify-center gap-2">
                      <p className="text-[var(--text-muted)] text-xs">
                        {hasSpeech ? 'Ses algılandı!' : 'Lütfen bir şeyler söyleyin...'}
                      </p>
                      {/* Audio level bars */}
                      <div className="flex items-end gap-1 h-10">
                        {Array.from({ length: 20 }).map((_, i) => {
                          const threshold = i / 20;
                          const isActive = audioLevel > threshold;
                          const barColor = i < 12
                            ? 'bg-[var(--success)]'
                            : i < 16
                              ? 'bg-[var(--warning)]'
                              : 'bg-[var(--error)]';
                          return (
                            <div
                              key={i}
                              className={`flex-1 rounded-sm transition-all duration-75 ${
                                isActive ? barColor : 'bg-[var(--bg-secondary)]'
                              }`}
                              style={{
                                height: `${30 + (i / 20) * 70}%`,
                                opacity: isActive ? 1 : 0.3,
                              }}
                            />
                          );
                        })}
                      </div>
                      {hasSpeech && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)]" />
                          <span className="text-[var(--success)] text-xs font-medium">Mikrofon çalışıyor</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mic/environment tip */}
            <div className="flex items-start gap-2.5 p-3 bg-[var(--accent-primary)]/5 border border-[var(--accent-primary)]/15 rounded-lg">
              <Headphones className="w-4 h-4 text-[var(--accent-primary)] flex-shrink-0 mt-0.5" />
              <p className="text-[var(--text-muted)] text-xs leading-relaxed">
                Kulaklıklı bir mikrofon kullanmanız ve arka plan seslerinden arındırılmış bir ortamda olmanız, görüşme esnasında cevaplarınızı doğru alabilmemiz için önemlidir.
              </p>
            </div>

            {/* Other system checks (compact) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <CompactCheckItem
                icon={Headphones}
                label="Ses Çıkışı"
                status={audioOutputStatus === 'checking' ? 'loading' : audioOutputStatus === 'available' ? 'success' : 'error'}
                statusText={audioOutputStatus === 'checking' ? 'Kontrol...' : audioOutputStatus === 'available' ? 'Hazır' : 'Bulunamadı'}
                onRetry={audioOutputStatus === 'unavailable' ? recheckAudioOutput : undefined}
              />
              <CompactCheckItem
                icon={connectionQuality === 'offline' ? WifiOff : Wifi}
                label="İnternet"
                status={getBandwidthDisplay().status}
                statusText={getBandwidthDisplay().text}
                onRetry={connectionQuality !== 'checking' ? recheckConnection : undefined}
              />
              <CompactCheckItem
                icon={Wifi}
                label="Sunucu"
                status={wsConnected ? 'success' : 'loading'}
                statusText={wsConnected ? 'Bağlı' : 'Bağlanıyor...'}
              />
            </div>

            {connectionQuality === 'poor' && (
              <div className="p-3 bg-[var(--warning)]/10 border border-[var(--warning)]/30 rounded-lg">
                <p className="text-[var(--warning)] text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Bağlantınız zayıf. Görüşme sırasında kesintiler yaşayabilirsiniz.</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ==================== GÖRÜŞME HAKKINDA ==================== */}
        <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-default)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-default)]">
            <h3 className="text-[var(--text-primary)] font-semibold flex items-center gap-2">
              <Info className="w-5 h-5 text-[var(--accent-primary)]" />
              Görüşme Hakkında
            </h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-3 text-[var(--text-secondary)] text-sm">
              <InfoItem icon={RefreshCcw} title="Sıra Tabanlı Görüşme" description="Bu görüşme sıra tabanlıdır. AI mülakatçı konuşurken siz dinlersiniz, sıra size geçtiğinde mikrofon otomatik olarak aktif olur. Konuşmanız bittiğinde Gönder butonuna basarsınız." />
              <InfoItem icon={MessageSquare} title="Yapay Zeka Destekli" description="Görüşme yapay zeka destekli bir asistan tarafından yürütülmektedir." />
              <InfoItem icon={Clock} title="Süre" description="Görüşme ortalama 10-15 dakika sürmektedir." />
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
                KVKK Aydınlatma Metni&apos;ni okudum ve kişisel verilerimin işlenmesine açık rıza veriyorum.
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
        <div className="pt-2 pb-4 sm:pb-2">
          <button onClick={handleStart} disabled={!canStart}
            className={`w-full py-4 rounded-xl font-semibold text-lg transition-all duration-200 flex items-center justify-center gap-3 active:scale-[0.98] ${canStart ? 'bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-muted)] text-white hover:shadow-lg hover:shadow-[var(--accent-primary)]/30 hover:scale-[1.02]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'}`}
          >
            <Play className="w-6 h-6" />
            Görüşmeye Başla
          </button>

          {!canStart && (
            <p className="text-center text-[var(--text-muted)] text-sm mt-3">
              {!systemChecksPassed 
                ? 'Lütfen sistem kontrollerinin tamamlanmasını bekleyin.'
                : !hasSpeech
                  ? 'Lütfen mikrofona bir şeyler söyleyerek test edin.'
                  : !kvkkAccepted 
                    ? 'Devam etmek için KVKK onayı vermeniz gerekmektedir.'
                    : !headphoneAck
                      ? 'Kulaklık/ses onayı verin.'
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

interface CompactCheckItemProps {
  icon: React.ElementType;
  label: string;
  status: 'success' | 'error' | 'warning' | 'loading';
  statusText: string;
  onRetry?: () => void;
}

function CompactCheckItem({ icon: Icon, label, status, statusText, onRetry }: CompactCheckItemProps) {
  const config = getCheckStatusConfig(status);
  return (
    <div className="flex items-center gap-2.5 p-3 rounded-lg bg-[var(--bg-tertiary)]">
      <Icon className={`w-4 h-4 ${config.color} flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-[var(--text-primary)] text-xs font-medium truncate">{label}</p>
        <p className={`text-xs truncate ${config.color}`}>{statusText}</p>
      </div>
      {status === 'loading' ? (
        <Loader2 className={`w-4 h-4 ${config.color} animate-spin flex-shrink-0`} />
      ) : (
        <div className="flex items-center gap-1 flex-shrink-0">
          <config.icon className={`w-4 h-4 ${config.color}`} />
          {onRetry && (
            <button onClick={onRetry} className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Tekrar dene">
              <RefreshCw className="w-3 h-3 text-[var(--text-muted)]" />
            </button>
          )}
        </div>
      )}
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
