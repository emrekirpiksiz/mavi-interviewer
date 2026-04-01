# BÖLÜM 7: FRONTEND ARCHITECTURE

> **Versiyon:** 2.0  
> **Son Güncelleme:** 2026-01-25  
> **Durum:** ✅ Implementation Tamamlandı

---

## 7.1 Genel Bakış

Next.js 14 App Router ile tek sayfalık görüşme uygulaması.

### Tasarım Prensipleri
- **Dark mode only:** Temiz, minimal tasarım
- **Mobile responsive:** Küçük ekranlarda küçülen layout
- **Real-time:** WebSocket ile anlık güncelleme
- **Simple:** Minimum complexity

---

## 7.2 Sayfa Yapısı

```
/                           → "Session ID gerekli" hatası
/interview/[sessionId]      → Görüşme sayfası
```

### Root Sayfa (/)

Basit hata sayfası:
```
┌─────────────────────────────────────────┐
│                                         │
│           AI Interview                  │
│                                         │
│   ⚠️ Görüşme ID'si gerekli             │
│                                         │
│   Lütfen size gönderilen görüşme       │
│   linkini kullanın.                    │
│                                         │
└─────────────────────────────────────────┘
```

---

## 7.3 Interview Sayfası States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PAGE STATE MACHINE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐
│   LOADING   │  → Session yükleniyor
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│   SETUP     │────►│   ERROR     │  → Mikrofon izni reddedildi
│ (izinler)   │     │             │    veya bağlantı hatası
└──────┬──────┘     └─────────────┘
       │
       │ Tüm izinler OK
       ▼
┌─────────────┐
│   READY     │  → "Görüşmeye Başla" butonu
└──────┬──────┘
       │
       │ Kullanıcı başlat
       ▼
┌─────────────┐
│   ACTIVE    │  → Görüşme devam ediyor
└──────┬──────┘
       │
       │ Görüşme bitti
       ▼
┌─────────────┐
│  COMPLETED  │  → Teşekkür mesajı
└─────────────┘
```

---

## 7.4 Component Hiyerarşisi

```
app/interview/[sessionId]/page.tsx
│
└── InterviewPage
    ├── LoadingScreen              (pageState = 'loading')
    │   └── Spinner + "Yükleniyor..."
    │
    ├── SetupScreen                (pageState = 'setup')
    │   ├── MicrophoneCheck
    │   │   ├── RequestPermissionButton
    │   │   └── PermissionStatus
    │   └── ConnectionCheck
    │       └── WebSocketStatus
    │
    ├── ReadyScreen                (pageState = 'ready')
    │   ├── WelcomeMessage
    │   │   ├── CandidateName
    │   │   └── PositionTitle
    │   └── StartButton
    │
    ├── ActiveScreen               (pageState = 'active')
    │   ├── Header
    │   │   ├── Logo/Title
    │   │   ├── Timer
    │   │   └── ConnectionIndicator
    │   ├── MainContent
    │   │   ├── AvatarSection
    │   │   │   └── SimliAvatar
    │   │   ├── PhaseIndicator
    │   │   │   └── PhaseItem (x6)
    │   │   └── TranscriptPanel
    │   │       ├── TranscriptEntry (AI)
    │   │       └── TranscriptEntry (Candidate)
    │   └── ControlBar
    │       ├── MicButton
    │       ├── InterruptButton
    │       └── EndCallButton
    │
    ├── CompletedScreen            (pageState = 'completed')
    │   └── ThankYouMessage
    │
    └── ErrorScreen                (pageState = 'error')
        ├── ErrorIcon
        ├── ErrorMessage
        └── RetryButton (opsiyonel)
```

---

## 7.5 Zustand Store

```typescript
// stores/interviewStore.ts

interface InterviewStore {
  // ===== SESSION =====
  sessionId: string | null;
  session: {
    candidateName: string;
    positionTitle: string;
    companyName: string;
    maxDurationMinutes: number;
  } | null;
  
  // ===== PAGE STATE =====
  pageState: 'loading' | 'setup' | 'ready' | 'active' | 'completed' | 'error';
  error: string | null;
  
  // ===== SETUP CHECKS =====
  micPermission: 'pending' | 'granted' | 'denied';
  wsConnected: boolean;
  simliReady: boolean;
  
  // ===== INTERVIEW STATE =====
  interviewState: 'idle' | 'ai_generating' | 'ai_speaking' | 'waiting_candidate' | 'candidate_speaking' | 'processing';
  currentPhase: 'introduction' | 'experience' | 'technical' | 'behavioral' | 'motivation' | 'closing';
  currentTurn: 'ai' | 'candidate'; // Sıra kimde? Mikrofon sadece 'candidate' iken aktif
  
  // ===== TRANSCRIPT =====
  transcriptEntries: Array<{
    id: string;
    speaker: 'ai' | 'candidate';
    content: string;
    timestamp: number;
  }>;
  partialTranscript: string;  // Aday konuşurken anlık
  
  // ===== TIMER =====
  elapsedSeconds: number;
  
  // ===== ACTIONS =====
  setSession: (session: SessionData) => void;
  setPageState: (state: PageState) => void;
  setMicPermission: (status: PermissionStatus) => void;
  setWsConnected: (connected: boolean) => void;
  setSimliReady: (ready: boolean) => void;
  setInterviewState: (state: InterviewState) => void;
  setPhase: (phase: Phase) => void;
  addTranscriptEntry: (entry: TranscriptEntry) => void;
  setPartialTranscript: (text: string) => void;
  setError: (error: string) => void;
  tick: () => void;  // Timer increment
  reset: () => void;
}
```

---

## 7.6 Custom Hooks

### useWebSocket

```typescript
// hooks/useWebSocket.ts

interface UseWebSocketReturn {
  connect: (sessionId: string) => void;
  disconnect: () => void;
  send: (event: string, data: any) => void;
  isConnected: boolean;
  onAudioChunk: (callback: (data: Uint8Array) => void) => void;
}

// Events dinleme store üzerinden yapılır
// Hook sadece bağlantı yönetimi
// Binary audio data için özel callback
```

### useWhisper

```typescript
// hooks/useWhisper.ts

interface UseWhisperReturn {
  isRecording: boolean;
  recordingDuration: number;   // Saniye cinsinden
  startRecording: () => void;
  stopRecording: () => void;
  transcribe: (audioBlob: Blob) => Promise<string>;
}

// MediaRecorder + Backend Whisper API
// Minimum 2 saniye kayıt zorunluluğu
```

### useAudioPlayer (DEPRECATED)

```typescript
// hooks/useAudioPlayer.ts

// ⚠️ DEPRECATED - Simli kendi audio'sunu kullanıyor
// Bu hook artık kullanılmıyor, Simli WebRTC üzerinden
// hem video hem audio playback yapıyor.
```

### useSimli

```typescript
// hooks/useSimli.ts

interface UseSimliReturn {
  initialize: (videoRef: RefObject<HTMLVideoElement>, audioRef: RefObject<HTMLAudioElement>) => void;
  sendAudioToSimli: (audioData: Uint8Array) => Promise<number>; // Returns duration
  clearSimliBuffer: () => void;
  isReady: boolean;
  isSpeaking: boolean;
}

// Simli SDK v2.0.0 entegrasyonu
// Chunked audio sending (6000 bytes, 20ms interval)
// Audio duration hesaplama
```

### useInterview (Orchestrator)

```typescript
// hooks/useInterview.ts

// Tüm hook'ları bir arada yönetir
// WebSocket event'lerini dinler ve uygun aksiyonları alır

interface UseInterviewReturn {
  startInterview: () => void;           // interview:start event
  endInterview: () => void;             // interview:end event
  interrupt: () => void;                // candidate:interrupt event
  startRecording: () => void;           // Mikrofon başlat
  stopAndSendRecording: () => void;     // Kaydet + Whisper + Backend
  processAudio: (data: Uint8Array) => void; // Audio → Simli koordinasyonu
  
  // Simli için ref ve state
  simliReady: boolean;
  simliSpeaking: boolean;
  initializeSimli: (videoRef, audioRef) => void;
}
```

### Hook Koordinasyonu

```
useInterview (Orchestrator)
    │
    ├── useWebSocket ─── Backend iletişimi
    │
    ├── useWhisper ───── STT (MediaRecorder + Whisper API)
    │
    └── useSimli ─────── Avatar lip-sync + audio playback
```

---

## 7.7 Layout Tasarımı

### Desktop (≥1024px)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ HEADER                                                                       │
│  AI Interview │ TechCorp - Senior Frontend Developer    ⏱️ 12:34  🟢 Online │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                    ┌─────────────────────────────────┐                      │
│                    │                                 │                      │
│                    │                                 │                      │
│                    │         AVATAR (Simli)         │                      │
│                    │           ~400px               │                      │
│                    │                                 │                      │
│                    │                                 │                      │
│                    └─────────────────────────────────┘                      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ● Introduction  ● Experience  ◉ Technical  ○ Behavioral  ○ ...     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ TRANSCRIPT (scrollable, tümü gösterilir)                            │   │
│  │                                                                     │   │
│  │  🤖 AI: Merhaba Ahmet, TechCorp görüşmesine hoş geldin.            │   │
│  │                                                                     │   │
│  │  👤 Sen: Merhaba, teşekkür ederim.                                  │   │
│  │                                                                     │   │
│  │  🤖 AI: TechMart'taki deneyiminden bahseder misin?                 │   │
│  │                                                                     │   │
│  │  👤 Sen: 2 yılı aşkın süredir orada çalışıyorum...                 │   │
│  │         [typing... - aday konuşurken]                              │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         CONTROL BAR                                  │   │
│  │                                                                     │   │
│  │              🎤                ✋               📞                   │   │
│  │           Mikrofon            Kes            Bitir                  │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Mobile (<768px)

```
┌───────────────────────────────────┐
│ HEADER                            │
│ AI Interview      ⏱️ 12:34  🟢   │
├───────────────────────────────────┤
│                                   │
│    ┌─────────────────────────┐    │
│    │                         │    │
│    │     AVATAR (küçük)      │    │
│    │        ~200px           │    │
│    │                         │    │
│    └─────────────────────────┘    │
│                                   │
│  ● ● ◉ ○ ○ ○  (fazlar - dot)     │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ TRANSCRIPT                  │  │
│  │                             │  │
│  │ 🤖 React hooks hakkında... │  │
│  │                             │  │
│  │ 👤 useEffect kullanırken..│  │
│  │                             │  │
│  └─────────────────────────────┘  │
│                                   │
│  ┌─────────────────────────────┐  │
│  │    🎤      ✋      📞       │  │
│  └─────────────────────────────┘  │
│                                   │
└───────────────────────────────────┘
```

---

## 7.8 UI Components

### ControlBar Butonları

| Buton | İkon | State | Disabled When |
|-------|------|-------|---------------|
| Mikrofon | 🎤 | active/muted | AI konuşurken |
| Kes (Interrupt) | ✋ | - | AI konuşmuyorken |
| Bitir | 📞 | - | Görüşme bitmişken |

### PhaseIndicator

```
● Completed (filled, green)
◉ Current (filled, blue, pulse animation)
○ Pending (outline, gray)
```

### TranscriptEntry

```typescript
interface TranscriptEntryProps {
  speaker: 'ai' | 'candidate';
  content: string;
  isPartial?: boolean;  // Aday konuşurken true
}

// AI: Sol hizalı, mavi arka plan
// Candidate: Sağ hizalı, gri arka plan
// Partial: İtalik, opacity düşük
```

### ConnectionIndicator

```
🟢 Online (green dot)
🟡 Connecting (yellow dot, pulse)
🔴 Offline (red dot)
```

---

## 7.9 Dark Mode Renk Paleti

```css
:root {
  /* Background */
  --bg-primary: #0a0a0f;      /* Ana arka plan */
  --bg-secondary: #12121a;    /* Card/Panel arka plan */
  --bg-tertiary: #1a1a24;     /* Hover state */
  
  /* Text */
  --text-primary: #ffffff;
  --text-secondary: #a0a0b0;
  --text-muted: #606070;
  
  /* Accent */
  --accent-primary: #3b82f6;   /* Blue - AI, current phase */
  --accent-success: #22c55e;   /* Green - completed, online */
  --accent-warning: #eab308;   /* Yellow - connecting */
  --accent-error: #ef4444;     /* Red - error, offline */
  
  /* Border */
  --border-default: #2a2a3a;
  --border-focus: #3b82f6;
}
```

---

## 7.10 Error Handling UI

### Mikrofon İzni Reddedildi

```
┌─────────────────────────────────────┐
│                                     │
│         🎤 ❌                       │
│                                     │
│   Mikrofon İzni Gerekli            │
│                                     │
│   Görüşme yapabilmek için          │
│   mikrofon iznini vermeniz         │
│   gerekmektedir.                   │
│                                     │
│   [ İzin Ver ]                     │
│                                     │
└─────────────────────────────────────┘
```

### Bağlantı Hatası

```
┌─────────────────────────────────────┐
│                                     │
│         🔌 ❌                       │
│                                     │
│   Bağlantı Kurulamadı              │
│                                     │
│   Sunucuya bağlanırken bir         │
│   sorun oluştu.                    │
│                                     │
│   [ Tekrar Dene ]                  │
│                                     │
└─────────────────────────────────────┘
```

### Session Bulunamadı

```
┌─────────────────────────────────────┐
│                                     │
│         📋 ❌                       │
│                                     │
│   Görüşme Bulunamadı               │
│                                     │
│   Bu görüşme mevcut değil veya     │
│   süresi dolmuş olabilir.          │
│                                     │
└─────────────────────────────────────┘
```

### Bağlantı Yavaş Uyarısı (Toast)

```
┌─────────────────────────────────────┐
│ ⚠️ Bağlantınız yavaş görünüyor     │
└─────────────────────────────────────┘
```

---

## 7.11 Completed Screen

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                                                                             │
│                              ✓                                              │
│                                                                             │
│                    Görüşme Tamamlandı                                       │
│                                                                             │
│           Zaman ayırdığınız için teşekkür ederiz.                          │
│           En kısa sürede sizinle iletişime geçeceğiz.                      │
│                                                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7.12 Kesinleşen Kararlar

| Karar | Değer | Gerekçe |
|-------|-------|---------|
| Landing page | "Session ID gerekli" hatası | Basit, gerekli bilgi |
| Tema | Dark mode only | Temiz, minimal, görüşme ortamına uygun |
| Responsive | Küçülen layout | Mobilde de kullanılabilir |
| Transcript | Tümü gösterilsin | Geri dönüp bakılabilir |
| State management | Zustand | Basit, performanslı |

---

## 7.13 Dosya Yapısı

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Root - Session ID gerekli
│   ├── globals.css
│   └── interview/
│       └── [sessionId]/
│           └── page.tsx            # Ana görüşme sayfası
├── components/
│   ├── ui/                         # shadcn/ui
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   └── ...
│   ├── interview/
│   │   ├── LoadingScreen.tsx
│   │   ├── SetupScreen.tsx
│   │   ├── ReadyScreen.tsx         # Sadece pageState değiştirir
│   │   ├── ActiveScreen.tsx        # Simli init + interview start
│   │   ├── CompletedScreen.tsx
│   │   ├── ErrorScreen.tsx
│   │   ├── Avatar.tsx              # Simli wrapper + video/audio ref
│   │   ├── TranscriptPanel.tsx
│   │   ├── TranscriptEntry.tsx
│   │   ├── PhaseIndicator.tsx
│   │   ├── ControlBar.tsx          # Kayıt süresi göstergesi
│   │   ├── Timer.tsx
│   │   └── ConnectionIndicator.tsx
│   └── common/
│       ├── Spinner.tsx
│       └── Toast.tsx
├── hooks/
│   ├── useWebSocket.ts             # Backend WebSocket iletişimi
│   ├── useWhisper.ts               # OpenAI Whisper STT (YENİ)
│   ├── useAudioPlayer.ts           # DEPRECATED - Simli kullanıyor
│   ├── useSimli.ts                 # Simli SDK v2.0.0
│   └── useInterview.ts             # Orchestrator
├── stores/
│   └── interviewStore.ts
├── lib/
│   ├── api.ts
│   └── utils.ts
└── types/
    └── index.ts
```

### Interview Başlatma Akışı (Önemli)

```
1. ReadyScreen
   └── handleStart() → setPageState('active')
       └── onStart() ÇAĞRILMIYOR

2. ActiveScreen
   └── useEffect → initializeSimli(videoRef, audioRef)
   └── useEffect → simliReady olduktan sonra → onStartInterview()
       └── interview.startInterview() → interview:start event

3. Backend
   └── handleStartInterview() → Claude → TTS → Audio → Text
       └── streamTTS() önce → ai:speaking:start sonra
```

---

**Önceki Bölüm:** [06-realtime-pipeline.md](./06-realtime-pipeline.md)  
**Sonraki Bölüm:** [08-security-auth.md](./08-security-auth.md)
