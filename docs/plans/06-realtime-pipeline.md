# BÖLÜM 6: REALTIME AUDIO/VIDEO PIPELINE

> **Versiyon:** 2.0  
> **Son Güncelleme:** 2026-01-25  
> **Durum:** ✅ Implementation Tamamlandı

---

## 6.1 Genel Bakış

Realtime pipeline üç ana servis kullanır:
- **OpenAI Whisper:** Speech-to-Text (Türkçe/İngilizce) - MediaRecorder + Backend API
- **ElevenLabs:** Text-to-Speech (PCM16 16kHz, Full Buffer yaklaşımı)
- **Simli:** AI Avatar (SDK v2.0.0, PCM16 audio ile lip-sync, WebRTC video)

### Temel Prensipler
- Düşük latency öncelikli
- Basit error handling (uyarı göster)
- Mikrofon izni zorunlu (text input yok)
- Text-ses senkronizasyonu (TTS önce, text sonra)

---

## 6.2 Pipeline Genel Görünümü

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REALTIME PIPELINE (v2.0)                             │
└─────────────────────────────────────────────────────────────────────────────┘

                              AI KONUŞURKEN
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Claude    │───►│ ElevenLabs  │───►│   Backend   │───►│  Frontend   │
│  (Text)     │    │ (TTS/PCM16) │    │(Full Buffer)│    │  (Chunks)   │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                               │
                                                               │ 6000 byte chunks
                                                               │ 20ms interval
                                                               ▼
                                                        ┌─────────────┐
                                                        │   Simli     │
                                                        │(Lip-sync +  │
                                                        │Audio+Video) │
                                                        └─────────────┘

                             ADAY KONUŞURKEN
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Microphone │───►│  Frontend   │───►│   Backend   │───►│  Frontend   │
│  (Audio)    │    │(MediaRec.)  │    │  (Whisper)  │    │ (Transcript)│
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                               │
                                                               │ Final transcript
                                                               ▼
                                                        ┌─────────────┐
                                                        │   Backend   │
                                                        │ (Save + AI) │
                                                        └─────────────┘
```

---

## 6.3 Görüşme Başlatma Akışı

### Pre-flight Checks

Görüşme başlamadan önce tüm bileşenler hazır olmalı:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      GÖRÜŞME BAŞLATMA ADIMLARI (v2.0)                        │
└─────────────────────────────────────────────────────────────────────────────┘

1. Sayfa Yüklendi (LoadingScreen)
       │
       ▼
2. Session bilgileri yüklendi
       │
       ▼
3. Mikrofon İzni Al (SetupScreen)
   ├── İzin verildi ──► Devam
   └── İzin reddedildi ──► "Mikrofon izni gerekli" hatası, STOP
       │
       ▼
4. WebSocket Bağlantısı (Backend)
   ├── Başarılı ──► connection:ready event alındı
   └── Başarısız ──► "Bağlantı kurulamadı" hatası, Retry butonu
       │
       ▼
5. UI: "Görüşmeye Başla" butonu aktif (ReadyScreen)
       │
       ▼
6. Kullanıcı "Başla" tıkladı
   │
   └── Sadece pageState = 'active' yapılır
       │
       ▼
7. ActiveScreen render edilir
       │
       ▼
8. Simli Avatar Initialize (ActiveScreen içinde)
   ├── Başarılı ──► simliReady = true
   └── Başarısız ──► Avatar olmadan devam (sadece ses)
       │
       ▼
9. Simli Ready olduktan SONRA interview:start event gönderilir
       │
       ▼
10. Backend: Claude ilk mesajı üretir → TTS yapar → Audio gönderir
       │
       ▼
11. Backend: ai:speaking:start event'i gönderir (TTS tamamlandıktan SONRA)
       │
       ▼
12. Frontend: Audio → Simli'ye chunked gönderilir (lip-sync başlar)
```

### Senkronizasyon Mantığı

Text-ses senkronizasyonu için kritik akış:

```
Backend Handler Flow:
1. Claude response üretir (text)
2. ElevenLabs TTS'e gönder → PCM16 audio döner
3. Audio'yu WebSocket ile frontend'e gönder (binary)
4. SONRA ai:speaking:start event'i gönder (text ile birlikte)

Frontend Flow:
1. Binary audio gelir → processAudio fonksiyonu
2. Audio chunklara bölünür (6000 byte)
3. Her chunk Simli'ye 20ms aralıkla gönderilir
4. ai:speaking:start gelir → Text transcript'e eklenir
5. Audio süresi hesaplanır → Sonra waiting_candidate state'e geçilir
```

### Mikrofon İzni

```typescript
// Frontend: Görüşme sayfası yüklendiğinde
async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stream'i sakla, sonra kullanılacak
    return true;
  } catch (error) {
    // İzin reddedildi veya mikrofon yok
    showError("Görüşme için mikrofon izni gereklidir.");
    return false;
  }
}
```

---

## 6.4 OpenAI Whisper Entegrasyonu (STT)

> MediaRecorder ile ses kaydı alınıp backend'deki Whisper API endpoint'ine gönderilir.

### API Endpoint

```
POST /api/transcribe

Content-Type: multipart/form-data
Body:
  - audio: Blob (webm/opus veya mp4/aac format)

Response:
{
  "transcript": "Merhaba, ben Ahmet"
}
```

### Akış

```
Frontend                                   Backend                      OpenAI
   │                                          │                           │
   │  [candidate:speaking:start]             │                           │
   │  MediaRecorder.start()                  │                           │
   │                                          │                           │
   │  ... kullanıcı konuşuyor ...            │                           │
   │                                          │                           │
   │  [Gönder butonu veya kayıt durdur]      │                           │
   │  MediaRecorder.stop()                   │                           │
   │                                          │                           │
   │  POST /api/transcribe (audio blob)      │                           │
   │─────────────────────────────────────────►│                           │
   │                                          │  Whisper API call         │
   │                                          │─────────────────────────►│
   │                                          │                           │
   │                                          │  Transcript response      │
   │                                          │◄─────────────────────────│
   │                                          │                           │
   │  { transcript: "..." }                  │                           │
   │◄─────────────────────────────────────────│                           │
   │                                          │                           │
   │  transcript:update event (WS)           │                           │
   │─────────────────────────────────────────►│                           │
```

### Frontend Hook

```typescript
// useWhisper.ts - Basit kullanım
const { 
  isRecording,
  recordingDuration,   // Saniye cinsinden kayıt süresi
  startRecording, 
  stopRecording,
  transcribe           // Audio blob'u backend'e gönder
} = useWhisper();

// Aday konuşmaya başladığında
startRecording();

// Konuşma bittiğinde (manuel)
stopRecording();
// → Audio blob transcribe() ile backend'e gönderilir
```

### Önemli Notlar

- Minimum 2 saniye kayıt zorunluluğu (kısa kayıtlar hata verebilir)
- MediaRecorder format: webm/opus (Chrome) veya mp4/aac (Safari)
- Backend Whisper'a gönderir ve transcript döner
- Real-time transcript yok, sadece final transcript

---

## 6.5 ElevenLabs Entegrasyonu (TTS)

### Audio Format

**PCM16 16kHz** formatı kullanılıyor:
- Simli SDK ile uyumlu (lip-sync için gerekli)
- WAV header kontrolü ve strip
- Full buffer yaklaşımı (streaming yerine)

### API Request

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream?output_format=pcm_16000

Headers:
  - xi-api-key: {ELEVENLABS_API_KEY}
  - Content-Type: application/json

Body:
{
  "text": "Merhaba Ahmet, görüşmeye hoş geldin.",
  "model_id": "eleven_turbo_v2_5",
  "voice_settings": {
    "stability": 0.65,
    "similarity_boost": 0.8,
    "style": 0.15,
    "use_speaker_boost": true
  }
}

Response: Streaming binary (PCM16 16kHz chunks)
```

### Voice Settings Açıklaması

| Parametre | Değer | Açıklama |
|-----------|-------|----------|
| stability | 0.65 | Daha tutarlı, sakin ses |
| similarity_boost | 0.8 | Orijinal sese yakınlık |
| style | 0.15 | Hafif ifade varyasyonu |
| use_speaker_boost | true | Ses netliği artırma |

### Backend Full Buffer Yaklaşımı

```
Backend                         ElevenLabs                    Frontend
   │                                │                             │
   │  POST /text-to-speech/stream   │                             │
   │───────────────────────────────►│                             │
   │                                │                             │
   │  PCM16 chunks                  │                             │
   │◄───────────────────────────────│                             │
   │  (Buffer'a biriktir)           │                             │
   │                                │                             │
   │  [Stream end]                  │                             │
   │◄───────────────────────────────│                             │
   │                                │                             │
   │  WAV header kontrolü & strip   │                             │
   │                                │                             │
   │  WS: Binary (full audio)       │                             │
   │────────────────────────────────────────────────────────────►│
   │                                │                             │
   │  WS: ai:speaking:start (text)  │  ◄── TTS sonrası gönderilir │
   │────────────────────────────────────────────────────────────►│
   │                                │                             │
   │  WS: ai:speaking:end           │                             │
   │────────────────────────────────────────────────────────────►│
```

### WAV Header İşleme

ElevenLabs bazen WAV header ekleyebilir (44 byte). Backend'de kontrol ve strip:

```typescript
function stripWavHeader(buffer: Buffer): Buffer {
  // WAV signature: "RIFF"
  if (buffer.length > 44 && 
      buffer[0] === 0x52 && // R
      buffer[1] === 0x49 && // I
      buffer[2] === 0x46 && // F
      buffer[3] === 0x46) { // F
    return buffer.slice(44);
  }
  return buffer;
}
```

---

## 6.6 Simli Avatar Entegrasyonu

### Genel Yaklaşım

Simli SDK v2.0.0 kullanılıyor. Audio PCM16 16kHz formatında Simli'ye gönderilir, Simli hem lip-sync hem de audio playback yapıyor.

```
┌─────────────────────────────────────────────────────────────┐
│                SIMLI ENTEGRASYONU (v2.0)                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Initialize (ActiveScreen render olduğunda)              │
│     └─► SimliClient.Initialize({ apiKey, faceId, ... })     │
│     └─► simliClient.start() → WebRTC bağlantısı             │
│     └─► isReady = true (video/audio hazır)                  │
│                                                             │
│  2. AI konuşurken                                           │
│     └─► Full audio gelir (binary WebSocket)                 │
│     └─► 6000 byte chunks'a bölünür                          │
│     └─► Her chunk 20ms aralıkla simliClient.sendAudioData() │
│     └─► Simli lip-sync + audio playback yapar               │
│                                                             │
│  3. AI sustu                                                │
│     └─► Avatar idle pozisyonuna döner (otomatik)            │
│                                                             │
│  4. Interrupt                                               │
│     └─► clearSimliBuffer() → Audio temizlenir               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Simli SDK Konfigürasyonu

```typescript
const config: SimliClientConfig = {
  apiKey: SIMLI_API_KEY,
  faceId: 'cace3ef7-a4c4-425d-a8cf-a358eb0c427', // Önerilen faceId
  handleSilence: true,
  maxSessionLength: 3600,
  maxIdleTime: 600,
};

// Initialize
simliClient.Initialize({
  ...config,
  videoRef: videoElement,
  audioRef: audioElement, // Simli kendi audio'sunu kullanıyor
});

// Start (WebRTC bağlantısı)
simliClient.start();
```

### Chunked Audio Sending

```typescript
const CHUNK_SIZE = 6000;     // 3000 samples @ 16kHz 16-bit = ~187ms
const SEND_INTERVAL = 20;    // ms between chunks (smooth animation)

async function sendAudioToSimli(audioData: Uint8Array): Promise<number> {
  const totalChunks = Math.ceil(audioData.length / CHUNK_SIZE);
  
  for (let i = 0; i < audioData.length; i += CHUNK_SIZE) {
    const chunk = audioData.slice(i, Math.min(i + CHUNK_SIZE, audioData.length));
    simliClient.sendAudioData(chunk);
    
    if (i + CHUNK_SIZE < audioData.length) {
      await new Promise(resolve => setTimeout(resolve, SEND_INTERVAL));
    }
  }
  
  // Audio duration hesapla (bytes / bytes_per_second)
  const audioDurationMs = (audioData.length / 32000) * 1000;
  return audioDurationMs;
}
```

### Frontend Koordinasyonu

```typescript
// useInterview.ts - processAudio fonksiyonu
async function processAudio(audioData: Uint8Array) {
  // 1. Audio'yu Simli'ye gönder (lip-sync + playback)
  const audioDuration = await sendAudioToSimli(audioData);
  
  // 2. Audio süresi kadar bekle
  await new Promise(resolve => setTimeout(resolve, audioDuration));
  
  // 3. waiting_candidate state'e geç
  setInterviewState('waiting_candidate');
}

// Interrupt
function onInterrupt() {
  clearSimliBuffer();  // Simli buffer'ı temizle
}
```

### Simli Fallback

Simli bağlantısı başarısız olursa:
- Avatar gizlenir
- Görüşme devam eder (sadece text)
- Error log kaydedilir

### Önemli Notlar

- `useAudioPlayer` hook'u DEPRECATED - Simli kendi audio elementi kullanıyor
- Video ve audio ref'leri ActiveScreen'de Simli component'ine geçiriliyor
- faceId `.env.local` dosyasından okunuyor (`NEXT_PUBLIC_SIMLI_FACE_ID`)

---

## 6.7 Audio Playback (Simli)

> **Not:** `useAudioPlayer` hook'u DEPRECATED. Simli kendi audio elementini kullanıyor.

### Simli Audio Playback

```
┌─────────────────────────────────────────────────────────────┐
│                 AUDIO PLAYBACK (via Simli)                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  WebSocket                                                  │
│      │                                                      │
│      │ binary (full audio - PCM16)                         │
│      ▼                                                      │
│  ┌─────────────┐                                           │
│  │  Frontend   │                                           │
│  │ processAudio│                                           │
│  └──────┬──────┘                                           │
│         │                                                   │
│         │ 6000 byte chunks, 20ms interval                  │
│         ▼                                                   │
│  ┌─────────────┐                                           │
│  │   Simli     │  ← sendAudioData()                        │
│  │   Client    │                                           │
│  └──────┬──────┘                                           │
│         │                                                   │
│         │ WebRTC                                            │
│         ▼                                                   │
│  ┌─────────────┐                                           │
│  │   Audio     │  ← Simli'nin kendi audio elementi         │
│  │   Element   │  ← Lip-sync ile senkronize                │
│  └─────────────┘                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Audio Duration Hesaplama

Frontend'de audio süresini hesaplayarak state geçişlerini yönetiyoruz:

```typescript
// PCM16 16kHz: 2 bytes per sample, 16000 samples per second
// bytes_per_second = 2 * 16000 = 32000
const audioDurationMs = (audioData.length / 32000) * 1000;

// Audio süresi kadar bekle, sonra state değiştir
await new Promise(resolve => setTimeout(resolve, audioDurationMs));
setInterviewState('waiting_candidate');
```

---

## 6.8 Interrupt Mekanizması

### Akış

```
Frontend              Backend               ElevenLabs        Simli
   │                     │                      │               │
   │ [AI konuşuyor]      │                      │               │
   │◄────────────────────│◄─────────────────────│               │
   │                     │                      │               │
   │ [Aday mikrofona     │                      │               │
   │  konuşmaya başladı] │                      │               │
   │                     │                      │               │
   │ candidate:interrupt │                      │               │
   │────────────────────►│                      │               │
   │                     │                      │               │
   │                     │ Abort stream         │               │
   │                     │─────────────────────►│               │
   │                     │                      │               │
   │ [Audio playback     │                      │               │
   │  durdur]            │                      │               │
   │──────────┐          │                      │               │
   │◄─────────┘          │                      │               │
   │                     │                      │               │
   │ [Avatar idle]       │                      │               │
   │─────────────────────────────────────────────────────────►│
   │                     │                      │               │
   │ ai:interrupted      │                      │               │
   │◄────────────────────│                      │               │
   │                     │                      │               │
   │                     │ TTS: "Buyurun,       │               │
   │                     │ sizi dinliyorum"     │               │
   │                     │─────────────────────►│               │
   │ audio:chunk         │                      │               │
   │◄────────────────────│◄─────────────────────│               │
```

### Interrupt Algılama

İki yöntem:
1. **Manuel:** UI'da "Kes" butonu
2. **Otomatik:** Aday mikrofona konuşmaya başlarsa (VAD ile)

MVP için **manuel interrupt** yeterli. Otomatik algılama Faz 2'de eklenebilir.

---

## 6.9 Latency Handling

### "Bağlantı Yavaş" Uyarısı

Basit bir mekanizma:
- Audio chunk'lar arası süre > 500ms ise uyarı göster
- Uyarı: "Bağlantınız yavaş görünüyor"
- Görüşme devam eder (hard block yok)

```typescript
let lastChunkTime = Date.now();

function onAudioChunk(chunk: ArrayBuffer) {
  const now = Date.now();
  if (now - lastChunkTime > 500) {
    showWarning("Bağlantınız yavaş görünüyor");
  }
  lastChunkTime = now;
  // ... process chunk
}
```

---

## 6.10 Service Yapısı

### Frontend Hooks

```
hooks/
├── useWhisper.ts         # OpenAI Whisper STT (MediaRecorder + Backend API)
├── useAudioPlayer.ts     # DEPRECATED - Simli kendi audio'sunu kullanıyor
├── useSimli.ts           # Simli SDK v2.0.0 entegrasyonu
│   ├── initialize()      # SDK başlatma
│   ├── sendAudioToSimli()# Chunked audio sending
│   ├── clearSimliBuffer()# Buffer temizleme
│   └── isReady           # Bağlantı durumu
└── useInterview.ts       # Orchestrator
    ├── startInterview()  # interview:start event
    ├── processAudio()    # Audio → Simli koordinasyonu
    └── ...
```

### Backend Services

```
services/
├── ttsService.ts         # ElevenLabs TTS (PCM16 full buffer)
│   └── getFullAudioAndSend() # Audio buffer → WebSocket binary
└── (interviewEngine.ts içinde audio koordinasyonu)

routes/
└── transcribe.ts         # Whisper API endpoint
```

### Backend Handlers

```
websocket/handlers.ts
├── handleStartInterview()    # interview:start → Claude → TTS → Audio → Text
├── handleAskQuestion()       # TTS önce, ai:speaking:start sonra
├── handleEndInterview()      # Kapanış mesajı + TTS
└── handleCandidateInterrupt()# Interrupt + kısa yanıt
```

---

## 6.11 Error Handling

| Servis | Hata Durumu | Aksiyon |
|--------|-------------|---------|
| **Whisper** | Transcription hatası | "Ses tanıma hatası" uyarısı, retry butonu |
| **ElevenLabs** | Stream hatası | "Ses üretme hatası" uyarısı, soruyu text olarak göster |
| **Simli** | Avatar hatası | Avatar gizle, sadece ses ile devam |
| **Mikrofon** | İzin yok | Görüşme başlatılamaz |
| **Network** | Yüksek latency | "Bağlantı yavaş" uyarısı |

---

## 6.12 Kesinleşen Kararlar

| Karar | Değer | Gerekçe |
|-------|-------|---------|
| Audio format | PCM16 16kHz | Simli SDK uyumluluğu |
| STT | OpenAI Whisper | MediaRecorder + backend API |
| TTS | ElevenLabs Turbo v2.5 (full buffer) | Düşük latency, Simli uyumlu |
| TTS Voice Settings | stability: 0.65, similarity: 0.8, style: 0.15 | Doğal, sakin ses |
| Avatar | Simli SDK v2.0.0 | Lip-sync + audio playback |
| Avatar faceId | cace3ef7-a4c4-425d-a8cf-a358eb0c427 | Önerilen avatar |
| Audio Chunking | 6000 bytes, 20ms interval | Smooth lip-sync |
| Audio Playback | Simli'nin kendi audio elementi | Lip-sync senkronizasyonu |
| VAD | Yok (manuel gönder butonu) | Whisper final transcript |
| Mikrofon izni | Zorunlu | Text input yok |
| Interrupt | Manuel (UI butonu) | MVP için yeterli |
| Text-Ses Sync | TTS önce, text sonra | Senkronizasyon |

---

## 6.13 Önemli Notlar

### Simli Entegrasyonu (Tamamlandı ✅)

Implementation detayları:
- `simli-client` SDK v2.0.0 kullanılıyor
- PCM16 16kHz audio formatı (ElevenLabs'den)
- 6000 byte chunks, 20ms interval (smooth lip-sync)
- WebRTC ile video + audio stream
- Simli'nin kendi audio elementi playback yapıyor (useAudioPlayer deprecated)

### Interview Başlatma Akışı (Kritik)

1. ReadyScreen: Sadece pageState = 'active' yapıyor
2. ActiveScreen: Simli initialize + start
3. Simli bağlandıktan SONRA interview:start event gönderiliyor
4. Backend: Claude → TTS → Audio gönder → SONRA ai:speaking:start gönder
5. Frontend: Audio → Simli'ye chunked gönder → Text göster

### Browser Desteği

- Chrome, Firefox, Safari, Edge modern versiyonları
- WebRTC desteği gerekli (Simli için)
- MediaRecorder desteği gerekli (Whisper için)

---

**Önceki Bölüm:** [05-interview-engine.md](./05-interview-engine.md)  
**Sonraki Bölüm:** [07-frontend-architecture.md](./07-frontend-architecture.md)
