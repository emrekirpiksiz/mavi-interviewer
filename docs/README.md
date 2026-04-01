# AI Interview System - Dokümantasyon

> Yapay zeka destekli, gerçek zamanlı sesli görüşme sistemi

## 🎉 PLANLAMA TAMAMLANDI

Tüm 9 bölüm hazırlandı ve onaylandı. Implementation'a hazır.

---

## 📁 Doküman Yapısı

```
ai-interview/
├── .cursorrules                    # 🆕 Cursor AI kuralları
├── docs/
│   ├── README.md                   # Bu dosya
│   ├── WORKFLOW.md                 # 🆕 Vibe coding workflow
│   ├── plans/                      # Planlama dokümanları (9 bölüm)
│   │   ├── 01-system-architecture.md   ✅
│   │   ├── 02-database-design.md       ✅
│   │   ├── 03-api-design.md            ✅
│   │   ├── 04-project-structure.md     ✅
│   │   ├── 05-interview-engine.md      ✅
│   │   ├── 06-realtime-pipeline.md     ✅
│   │   ├── 07-frontend-architecture.md ✅
│   │   ├── 08-security-auth.md         ✅
│   │   └── 09-task-breakdown.md        ✅
│   ├── guides/
│   │   ├── create-session-guide.md
│   │   └── matchmind-api-guide.md
│   ├── features/                   # Gelecek özellik planları
│   └── samples/
│       └── ATS-Request-Sample.json # ATS veri örneği
└── ... (proje dosyaları)
```

---

## 🎯 Proje Özeti

**AI Interview**, HR ATS sisteminden bağımsız çalışan, yapay zeka destekli mülakat sistemidir.

### Temel Akış
```
ATS ──POST──► Interview API ──► {sessionId, joinUrl}
                                      │
Aday ──────────────────────────────► joinUrl
                                      │
                              Görüşme başlar
                              (AI avatar + ses)
                                      │
                              Görüşme biter
                                      │
Interview API ──POST──► ATS (transcript)
```

### Tech Stack
| Katman | Teknoloji |
|--------|-----------|
| Frontend | Next.js 15 / TailwindCSS / shadcn/ui / Zustand |
| Backend | Node.js + Express.js / PostgreSQL |
| AI | Claude Sonnet 4.5 (veya Haiku 3.5 for low latency) |
| STT | **OpenAI Whisper** (Deepgram'dan geçildi) |
| TTS | ElevenLabs Turbo v2.5 (PCM16 16kHz, full buffer yaklaşımı) |
| Avatar | Simli ✅ (SDK v2.0.0, PCM16 16kHz, chunked audio sending) |
| Realtime | WebSocket (ws) |

---

## 📋 Bölüm Özeti

| # | Bölüm | Öne Çıkan Kararlar |
|---|-------|-------------------|
| 1 | Sistem Mimarisi | Backend-first, Express.js, 10-50 concurrent |
| 2 | Database | JSONB (esnek), soft delete, 4 tablo |
| 3 | API | REST + WebSocket, ATS tek API key |
| 4 | Proje Yapısı | pnpm monorepo, raw SQL migrations |
| 5 | Interview Engine | Recruiter gibi davran, 30dk max, TR/EN |
| 6 | Realtime | PCM16 audio, Whisper STT, manuel interrupt |
| 7 | Frontend | Dark mode, responsive, Zustand |
| 8 | Security | UUID session, single connection, audit log |
| 9 | Tasks | 28 task, 7 phase, backend-first |

---

## 🚀 Sonraki Adımlar

1. **Vibe Coding Workflow** - Opus 4.5 ile çalışma standardı
2. **Cursor Rules** - Proje için özel kurallar
3. **Implementation** - Phase 1'den başla

---

## 📊 Implementation Phases

```
Phase 1: Foundation     ─► Phase 2: Session API  ─► Phase 3: WebSocket
                                                          │
Phase 7: Test ◄─ Phase 6: UI ◄─ Phase 5: Audio ◄─ Phase 4: Interview Engine
```

| Phase | Tasks | Focus |
|-------|-------|-------|
| 1 | 5 | Monorepo, DB, Express, Next.js |
| 2 | 3 | Session CRUD, REST API |
| 3 | 4 | WebSocket server & client |
| 4 | 4 | Claude, prompts, state machine |
| 5 | 4 | TTS, STT, audio player |
| 6 | 4 | Simli, UI components |
| 7 | 4 | Polish, tests |

**Total: 28 tasks**

---

## 📊 Implementation Status

| Phase | Status | Tasks | Notes |
|-------|--------|-------|-------|
| Phase 1: Foundation | ✅ | 5/5 | Tamamlandı |
| Phase 2: Session | ✅ | 3/3 | Tamamlandı |
| Phase 3: WebSocket | ✅ | 4/4 | Tamamlandı |
| Phase 4: Interview Engine | ✅ | 4/4 | Tamamlandı |
| Phase 5: Audio | ✅ | 4/4 | Tamamlandı |
| Phase 6: UI | ✅ | 4/4 | Tamamlandı |
| Phase 7: Polish | ⏳ | 0/4 | Sonraki phase |

**Legend:** ⏳ Başlamadı | 🔄 Devam ediyor | ✅ Tamamlandı | ⚠️ Sorun var | 🔍 Review bekliyor

### Task Detayları

#### Phase 1: Foundation ✅
- [x] Task 1.1: Monorepo Setup
- [x] Task 1.2: Shared Package
- [x] Task 1.3: Express.js Backend Boilerplate
- [x] Task 1.4: Database Setup
- [x] Task 1.5: Next.js Frontend Boilerplate

#### Phase 2: Session Management ✅
- [x] Task 2.1: Session Service
- [x] Task 2.2: REST API Endpoints
- [x] Task 2.3: ATS Mock Endpoint

**Phase 2 Oluşturulan Dosyalar:**
```
apps/api/src/
├── db/queries/
│   ├── sessions.ts      # Session CRUD
│   ├── configs.ts       # Interview config CRUD
│   ├── transcripts.ts   # Transcript CRUD
│   └── index.ts         # Barrel export
├── services/
│   └── sessionService.ts # Business logic
├── middleware/
│   ├── validation.ts    # Zod schemas
│   ├── rateLimiter.ts   # Rate limiter tanımları (Security Hardening)
│   └── apiKeyAuth.ts    # API key doğrulama (Security Hardening)
└── routes/
    ├── sessions.ts      # REST endpoints
    └── mock-ats.ts      # Mock ATS callback
```

**Phase 2 Değişiklikler:**
- `TopicImportance`: String → Number (1-5)
- ESM imports: `.js` uzantısı eklendi

#### Phase 3: WebSocket ✅
- [x] Task 3.1: WebSocket Server Setup
- [x] Task 3.2: WebSocket Event Handlers
- [x] Task 3.3: Frontend WebSocket Hook
- [x] Task 3.4: Zustand Store

**Phase 3 Oluşturulan Dosyalar:**
```
apps/api/src/
├── index.ts             # HTTP server + WS entegrasyonu
└── websocket/
    ├── index.ts         # WS server setup
    ├── connectionManager.ts  # Connection tracking
    └── handlers.ts      # Event handlers

apps/web/src/
├── hooks/
│   └── useWebSocket.ts  # WS client hook
└── stores/
    └── interviewStore.ts # Zustand store
```

**Phase 3 Özellikler:**
- Single connection policy (yeni bağlantı eskiyi kapatır)
- Session validation (UUID, exists, not completed)
- Event validation ve handling
- connection:ready event ile session bilgileri

#### Phase 4: Interview Engine ✅
- [x] Task 4.1: Claude Integration
- [x] Task 4.2: Prompt Builder
- [x] Task 4.3: State Machine
- [x] Task 4.4: Interview Flow Integration

**Phase 4 Oluşturulan Dosyalar:**
```
apps/api/src/services/
├── interviewEngine.ts   # Claude API entegrasyonu
├── promptBuilder.ts     # System/user prompt generation
└── stateMachine.ts      # State management
```

**Phase 4 Özellikler:**
- Claude 3.5 Sonnet entegrasyonu (claude-sonnet-4-20250514)
- Dinamik system prompt (TR/EN desteği)
- State machine: IDLE → READY → AI_GENERATING → AI_SPEAKING → WAITING_FOR_CANDIDATE → CANDIDATE_SPEAKING → PROCESSING → COMPLETED
- Phase yönetimi: introduction → experience → technical → behavioral → motivation → closing
- Conversation history tracking
- Transcript kaydetme (DB)
- JSON response format parsing

**Phase 4 WebSocket Events:**
- `interview:start` → Claude'dan ilk soru → `ai:speaking:start`
- `transcript:update` (isFinal=true) → Claude'a gönder → Sonraki aksiyon
- `phase:changed` event gönderimi
- `interview:ended` event gönderimi

#### Phase 5: Audio Pipeline ✅
- [x] Task 5.1: ElevenLabs TTS Service
- [x] Task 5.2: Audio Player Hook
- [x] Task 5.3: Whisper STT Hook
- [x] Task 5.4: Audio Pipeline Integration

**Phase 5 Oluşturulan Dosyalar:**
```
apps/api/src/services/
└── ttsService.ts         # ElevenLabs TTS (Turbo v2.5, PCM16 16kHz, full buffer)

apps/web/src/hooks/
├── useAudioPlayer.ts     # DEPRECATED - Simli kendi audio'sunu kullanıyor
└── useInterview.ts       # Audio pipeline orchestrator + Simli koordinasyonu
```

**Phase 5 Özellikler:**
- ElevenLabs TTS (PCM16 16kHz format - Simli uyumlu)
- Full buffer yaklaşımı (streaming yerine)
- WAV header kontrolü ve strip
- Binary WebSocket frames for complete audio
- Simli'nin kendi audio elementi playback yapıyor
- OpenAI Whisper STT (Phase 6'da eklendi)
- Auto-start listening after AI speaks
- Interrupt handling with TTS cancellation

**Phase 5 WebSocket Events:**
- Binary audio (full buffer): Backend → Frontend
- `ai:speaking:start/end` - TTS tamamlandıktan SONRA gönderiliyor (senkronizasyon için)
- `candidate:speaking:start/end` with recording
- `transcript:update` with final transcripts

**Phase 5 Bug Fix:**
- WebSocket message handler'ı async operasyonlardan ÖNCE set edilmeli (index.ts fix)
- TTS önce tamamlanıyor, sonra `ai:speaking:start` event gönderiliyor (text-ses senkronizasyonu)

#### Phase 6: Avatar & UI ✅
- [x] Task 6.1: Simli Avatar Integration ✅ (SDK v2.0.0 uyumlu, PCM16 16kHz)
- [x] Task 6.2: Interview Page UI
- [x] Task 6.3: Interview UI Components
- [x] Task 6.4: Full Flow Integration

**Phase 6 Oluşturulan Dosyalar:**
```
apps/web/src/
├── hooks/
│   ├── useSimli.ts          # Simli avatar hook (SDK v2.0.0, chunked audio)
│   ├── useWhisper.ts        # OpenAI Whisper STT hook
│   ├── useAudioPlayer.ts    # DEPRECATED - Simli kendi audio'sunu kullanıyor
│   └── useInterview.ts      # Orchestrator (Simli koordinasyonu)
├── app/
│   └── interview/
│       └── [sessionId]/
│           └── page.tsx     # Ana görüşme sayfası
└── components/
    ├── common/
    │   └── Spinner.tsx      # Loading spinner
    └── interview/
        ├── LoadingScreen.tsx     # Yükleme ekranı
        ├── SetupScreen.tsx       # İzin kontrolleri
        ├── ReadyScreen.tsx       # Başla butonu (sadece page state değiştirir)
        ├── ActiveScreen.tsx      # Ana görüşme UI (Simli bağlandıktan sonra interview başlatır)
        ├── CompletedScreen.tsx   # Tamamlandı ekranı
        ├── ErrorScreen.tsx       # Hata ekranı
        ├── Avatar.tsx            # Simli wrapper + fallback
        ├── TranscriptPanel.tsx   # Görüşme kaydı
        ├── TranscriptEntry.tsx   # Mesaj balonu
        ├── PhaseIndicator.tsx    # Faz göstergesi
        ├── ControlBar.tsx        # Kontrol butonları (kayıt süresi gösterimi)
        ├── Timer.tsx             # Süre göstergesi
        └── ConnectionIndicator.tsx # Bağlantı durumu

apps/api/src/routes/
└── transcribe.ts            # Whisper transcription endpoint

apps/api/src/services/
└── ttsService.ts            # ElevenLabs TTS (PCM16 full buffer, optimized voice settings)
```

**Phase 6 Özellikler:**
- ✅ Simli SDK v2.0.0 entegrasyonu (PCM16 16kHz audio format)
- ✅ Chunked audio sending (6000 bytes, 20ms interval) - smooth lip-sync
- ✅ Simli bağlandıktan SONRA interview:start gönderiliyor (ilk mesaj senkronizasyonu)
- ✅ TTS önce tamamlanıyor, sonra text gönderiliyor (text-ses senkronizasyonu)
- Page state machine: loading → setup → ready → active → completed | error
- Dark mode responsive UI
- Microphone permission flow
- WebSocket connection status
- Phase progress indicator
- Real-time transcript display
- Control bar: mic toggle, interrupt, end call
- Kayıt süresi göstergesi (saniye)

**Phase 6 Önemli Değişiklikler:**
1. **STT: OpenAI Whisper**
   - MediaRecorder + Whisper API
   - Backend'de `/transcribe` endpoint
   - Minimum 2 saniye kayıt zorunluluğu

2. **TTS: Full Buffer + Optimized Settings**
   - `eleven_multilingual_v2` → `eleven_turbo_v2_5`
   - PCM16 16kHz format (Simli uyumlu)
   - Full buffer yaklaşımı (streaming yerine)
   - WAV header strip
   - Optimized voice settings: stability: 0.65, similarity_boost: 0.8, style: 0.15

3. **Simli Avatar: Chunked Audio Sending**
   - 6000 byte chunks (3000 samples @ 16kHz 16-bit)
   - 20ms interval between chunks (smooth animation)
   - isSpeaking state for UI feedback
   - Default faceId: cace3ef7-a4c4-425d-a8cf-a358eb0c427

4. **Interview Flow Senkronizasyonu**
   - ReadyScreen: sadece page state değiştirir
   - ActiveScreen: Simli bağlandıktan sonra interview:start gönderir
   - Backend handlers: TTS önce tamamlanıyor, sonra ai:speaking:start gönderiliyor
   - Audio duration hesaplanıp waiting_candidate state'e geçiş bekleniyor

5. **Audio Playback**
   - useAudioPlayer DEPRECATED - Simli'nin kendi audio elementi kullanılıyor
   - Simli WebRTC üzerinden hem video hem audio stream yapıyor

6. **TEST MODE**
   - Position title'da "test" varsa basit 3 soruluk senaryo
   - Hızlı test için: "Adın ne?", "Türkiye'nin başkenti?", "Teşekkürler"

#### Phase 7: Polish (Sonraki)
- [ ] Task 7.1: Error Handling & Recovery
- [ ] Task 7.2: Performance Optimization
- [ ] Task 7.3: Integration Tests
- [ ] Task 7.4: Documentation

---

## 🔑 Environment Variables

### Backend (.env)
```bash
# Database
DATABASE_URL=postgresql://...

# AI Services
ANTHROPIC_API_KEY=sk-ant-...      # Claude API
OPENAI_API_KEY=sk-proj-...        # Whisper STT
ELEVENLABS_API_KEY=...            # TTS
ELEVENLABS_VOICE_ID=...           # Voice ID (önerilen: LcfcDJNUP1GQjkzn1xUU)

# Optional
SIMLI_API_KEY=...                 # Avatar (Simli lip-sync)

# MatchMind (HR Portal) Integration
MATCHMIND_API_URL=https://matchmind.nuevo.com.tr/api/ai-interviews
MATCHMIND_WEBHOOK_USERNAME=interview_app
MATCHMIND_WEBHOOK_PASSWORD=...    # MatchMind'dan alınacak

# Audio Recording (opsiyonel)
AUDIO_RECORDING_ENABLED=true
AUDIO_RECORDING_TEMP_DIR=/tmp/interview-recordings
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
AZURE_STORAGE_CONTAINER_NAME=interview-recordings
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
NEXT_PUBLIC_SIMLI_API_KEY=...     # Avatar (Simli lip-sync)
NEXT_PUBLIC_SIMLI_FACE_ID=cace3ef7-a4c4-425d-a8cf-a358eb0c427  # Önerilen faceId
```

---

## 🔗 Önemli Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `.cursorrules` | Cursor AI kuralları - her context'te okunur |
| `docs/WORKFLOW.md` | Vibe coding workflow - phase başlangıcında oku |
| `docs/plans/09-task-breakdown.md` | Task listesi - her zaman referans |
| `docs/features/backlog.md` | Gelecek özellik backlog'u |

---

*Son güncelleme: 2026-03-05*
*Planlama: ✅ Tamamlandı*
*Workflow: ✅ Hazır*
*Implementation: Phase 1 ✅ | Phase 2 ✅ | Phase 3 ✅ | Phase 4 ✅ | Phase 5 ✅ | Phase 6 ✅ | Phase 7 ⏳*
*Features: Security Hardening ✅ | Session Resilience ✅ | Audio Recording ✅ | Kısıtlamalar & UX Optimizasyonları ✅*

---

## 🔒 Security Hardening (Feature)

Security Hardening feature'ı iki bölümden oluşur:

### 1. Katmanlı Rate Limiting
- **Global:** 100 req/dk per IP (tüm REST endpoint'ler)
- **POST /sessions:** 10 req/dk per IP
- **POST /demo-session:** 5 req/dk per IP (brute-force engeli)
- **POST /transcribe:** 30 req/dk per IP
- **WebSocket bağlantı:** 10 bağlantı/dk per IP
- **WebSocket mesaj:** 60 mesaj/dk per session
- JSON body size limit: 1MB

### 2. API Key Authentication
- `POST /sessions` endpoint'i `X-API-Key` header'ı ile korunur
- Mevcut `ATS_API_KEY` env variable kullanılır (yeni env gerekmez)
- Eksik/geçersiz key → 401 Unauthorized

### Yeni Dosyalar
```
apps/api/src/middleware/
├── rateLimiter.ts   # Rate limiter tanımları (express-rate-limit)
└── apiKeyAuth.ts    # API key doğrulama middleware
```

### Detaylı Plan
- [Security Hardening Feature Plan](./features/security-hardening.md)

---

## 🔄 Session Resilience (Feature)

Session Resilience feature'ı WebSocket reconnection ve hata yönetimi sağlar:

### Temel Özellikler
- **Sayfa Refresh Desteği:** Sayfa yenilendiğinde aktif session otomatik algılanır ve reconnect akışı başlar
- **Cross-Browser Takeover:** Farklı tarayıcıdan aynı session'a bağlanıldığında eski bağlantı kesilir (code 4010)
- **Browser Close Detection:** sendBeacon ile tarayıcı kapanma tespiti
- **Event Loglama:** Tüm bağlantı olayları session_events tablosuna loglanır
- **Resume Akışı:** Kullanıcı onayı (buton tıklama) → AudioContext unlock → Simli init → interview:resume
- **Autoplay Policy Çözümü:** Simli init kullanıcı jesti içinde tetiklenir (Chrome autoplay policy uyumlu)

### Yeni Dosyalar
```
apps/web/src/components/interview/
├── ReconnectingScreen.tsx    # Yeniden bağlanma ekranı (adım adım progress)
└── TakenOverScreen.tsx       # Session takeover ekranı
```

### WebSocket Close Codes
| Code | Açıklama |
|------|----------|
| 4010 | Session taken over by another client |

### Yeni Endpoint
- `POST /sessions/:sessionId/disconnect` - Browser close detection (sendBeacon)

### Detaylı Plan
- [Session Resilience Feature Plan](./features/session-resilience.md)

---

## 🔗 MatchMind Entegrasyonu

MatchMind (HR Portal) ile webhook entegrasyonu sayesinde görüşme durumu ve transcript otomatik olarak senkronize edilir.

### Akış
```
Görüşme başladığında:
  Interview App ──POST /status──► MatchMind
                  { session_id, status: "in_progress" }

Görüşme tamamlandığında (AI bitirdi veya aday çıktı):
  Interview App ──POST /status──► MatchMind
                  { session_id, status: "completed", duration_seconds }
  
  Interview App ──POST /transaction──► MatchMind
                  { session_id, transaction: { session, entries[] } }

Teknik hata durumunda:
  Interview App ──POST /status──► MatchMind
                  { session_id, status: "technical_error" }
```

> **Not:** Hem AI'ın görüşmeyi bitirmesi (`completed`) hem de adayın "Görüşmeyi Bitir" butonuna basması (`candidate_left`) durumunda MatchMind'a `completed` olarak bildirilir ve transcript gönderilir.

### Yeni Dosyalar
```
apps/api/
├── migrations/
│   └── 008_create_webhook_logs.sql   # Webhook log tablosu
├── src/db/queries/
│   └── webhookLogs.ts                # Webhook log CRUD
└── src/services/
    └── matchmindService.ts           # MatchMind API client
```

### Özellikler
- HTTP Basic Authentication
- 30 saniye timeout
- Exponential backoff retry (1s, 2s, 4s - max 3 deneme)
- Fire-and-forget pattern (görüşme akışını bloklamaz)
- Tüm request/response logları `webhook_logs` tablosunda

### Kılavuzlar
- [MatchMind API Kılavuzu](./guides/matchmind-api-guide.md)
- [Session Oluşturma Kılavuzu](./guides/create-session-guide.md)

---

## 🎙️ Audio Recording (Feature)

Interview sırasında adayın gerçek mikrofon sesini kaydeder, interview sonunda MP3'e encode edip Azure Blob Storage'a upload eder.

### Temel Özellikler
- **Sadece aday sesi** kaydedilir (AI TTS sesi sentetik, transcript'te mevcut)
- **Feature toggle:** `AUDIO_RECORDING_ENABLED=true` ile açılır
- **Sessizlik yönetimi:** Segment arası boşluklar timestamp'lere göre korunur (gerçekçi dinleme deneyimi)
- **Async processing:** Encoding/upload işlemi interview flow'unu bloklamaz (fire-and-forget)
- **MP3 format:** 128kbps mono 16kHz (evrensel uyumluluk, emotion analysis için yeterli)

### Akış
```
Interview sırasında:
  Her /transcribe isteğindeki audio buffer → disk'e chunk olarak kaydet

Interview bittiğinde (async):
  Chunk'ları ffmpeg ile birleştir → sessizlik ekle → MP3 encode → Azure Blob upload
```

### Yeni Dosyalar
```
apps/api/
├── migrations/
│   └── 009_add_recording_fields.sql    # recording_status, recording_url alanları
└── src/services/
    └── audioRecordingService.ts        # Chunk kaydetme, ffmpeg encode, Azure upload
```

### Environment Variables
```bash
AUDIO_RECORDING_ENABLED=true
AUDIO_RECORDING_TEMP_DIR=/tmp/interview-recordings
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
AZURE_STORAGE_CONTAINER_NAME=interview-recordings
```

### Detaylı Plan
- [Audio Recording Feature Plan](./features/record-interview.md)

---

## 🔒 Kısıtlamalar & UX Optimizasyonları (Feature)

Tarayıcı/cihaz kısıtlaması, sıra göstergesi iyileştirmeleri, interrupt butonu kaldırma ve mikrofon akışı optimizasyonları.

### Temel Özellikler
- **Chrome-only + Desktop-only Gate:** Desteklenmeyen tarayıcı/cihazlarda uyarı banner (giriş) ve tam ekran engel (interview)
- **Interrupt Butonu Kaldırıldı:** ControlBar artık 2 buton: Mikrofon + Bitir (backend interrupt handler korunuyor)
- **Sıra Değişim Overlay:** AI → Aday geçişinde "SIRA SİZDE", Aday → AI geçişinde "SIRA AI'DA" büyük overlay
- **Mikrofon → Gönder Dönüşümü:** Kayıt yaparken mikrofon butonu ArrowUp ikonlu "Gönder" butonuna dönüşür
- **ReadyScreen İyileştirmeleri:** "Görüşme Nasıl İlerler?" bölümü, explicit mikrofon izni butonu

### Yeni Dosyalar
```
apps/web/src/
├── lib/
│   └── browserCheck.ts              # Tarayıcı ve cihaz tespit utility
└── components/interview/
    ├── UnsupportedBrowserScreen.tsx  # Desteklenmeyen ortam ekranı
    └── TurnOverlay.tsx              # Sıra değişim overlay bileşeni
```

### Değiştirilen Dosyalar
- `apps/web/src/app/page.tsx` - Tarayıcı uyarı banner
- `apps/web/src/app/interview/[sessionId]/page.tsx` - Browser gate + onInterrupt kaldırıldı
- `apps/web/src/components/interview/ControlBar.tsx` - Interrupt kaldırıldı, Gönder modu, help text
- `apps/web/src/components/interview/ActiveScreen.tsx` - onInterrupt kaldırıldı, TurnOverlay eklendi
- `apps/web/src/components/interview/ReadyScreen.tsx` - Sıra açıklaması, explicit mic izni
- `apps/web/tailwind.config.js` - overlay-in/out animasyonları

### Detaylı Plan
- [Kısıtlamalar & UX Optimizasyonları Feature Plan](./features/restrictions-optimizations.md)

---

## ⚠️ Bilinen Sorunlar

### macOS "Too Many Open Files" (Development)
- **Durum:** Next.js dev mode'da oluşabilir
- **Sebep:** macOS default file limit düşük
- **Çözüm:** `sudo launchctl limit maxfiles 65536 200000` veya production build kullan

### Simli Avatar Notları
- **Face ID:** `.env.local` dosyasında `NEXT_PUBLIC_SIMLI_FACE_ID` ayarlanmalı
- **Voice ID:** `.env` dosyasında `ELEVENLABS_VOICE_ID` ayarlanmalı
- **Önerilen Face ID:** `cace3ef7-a4c4-425d-a8cf-a358eb0c427`
- **Chunking:** 6000 byte chunks, 20ms interval (smooth animation için)
