# BÖLÜM 9: TASK BREAKDOWN

> **Versiyon:** 2.0  
> **Son Güncelleme:** 2026-01-25  
> **Durum:** ✅ Phase 6 Tamamlandı

---

## 9.1 Genel Bakış

Backend-first yaklaşım ile MVP geliştirme. Vibe coding (Opus 4.5) ile çalışmaya uygun task yapısı.

### Complexity Legend

| Size | Açıklama | Tahmini Effort |
|------|----------|----------------|
| **S** | Tek dosya, basit değişiklik | ~30 dk |
| **M** | 2-3 dosya, orta karmaşıklık | ~1-2 saat |
| **L** | Birden fazla dosya, entegrasyon | ~3-4 saat |
| **XL** | Kompleks, birden fazla sistem | ~1 gün |

### Implementation Order

```
PHASE 1: Foundation ──► PHASE 2: Session API ──► PHASE 3: WebSocket
                                                        │
PHASE 7: Test ◄── PHASE 6: UI ◄── PHASE 5: Audio ◄── PHASE 4: Interview Engine
```

---

## PHASE 1: FOUNDATION (Temel Altyapı)

### Task 1.1: Monorepo Setup
**Size:** M  
**Bağımlılık:** Yok

**Açıklama:**
pnpm workspace ile monorepo oluştur.

**Yapılacaklar:**
- Root `package.json` (workspace scripts)
- `pnpm-workspace.yaml`
- `apps/api` klasörü (boş package.json)
- `apps/web` klasörü (boş package.json)
- `packages/shared` klasörü
- `.gitignore`, `.env.example`
- Root `tsconfig.json` (base config)

**Kabul Kriterleri:**
- [x] `pnpm install` çalışıyor
- [x] `pnpm dev:api` ve `pnpm dev:web` script'leri tanımlı
- [x] Workspace'ler birbirini görebiliyor

---

### Task 1.2: Shared Package
**Size:** S  
**Bağımlılık:** 1.1

**Açıklama:**
Ortak types ve constants.

**Yapılacaklar:**
- `packages/shared/src/types.ts` - Session, Transcript, Event tipleri
- `packages/shared/src/constants.ts` - Phase, Status enums
- `packages/shared/src/index.ts` - Re-export

**Kabul Kriterleri:**
- [x] Types ve constants export ediliyor
- [x] Diğer package'lardan import edilebiliyor

---

### Task 1.3: Express.js Backend Boilerplate
**Size:** M  
**Bağımlılık:** 1.1

**Açıklama:**
Basic Express server setup.

**Yapılacaklar:**
- `apps/api/package.json` (dependencies)
- `apps/api/tsconfig.json`
- `apps/api/src/index.ts` - Entry point
- `apps/api/src/app.ts` - Express app setup
- `apps/api/src/config/index.ts` - Environment config
- CORS, JSON body parser middleware
- Health check endpoint (`GET /health`)

**Kabul Kriterleri:**
- [x] `pnpm dev:api` ile server başlıyor
- [x] `GET /health` 200 OK dönüyor
- [x] Environment variables yükleniyor

---

### Task 1.4: Database Setup
**Size:** L  
**Bağımlılık:** 1.3

**Açıklama:**
PostgreSQL connection ve migration'lar.

**Yapılacaklar:**
- `pg` package kurulumu
- `apps/api/src/db/index.ts` - Connection pool
- `apps/api/migrations/` klasörü - 6 SQL dosyası
- `apps/api/scripts/migrate.ts` - Migration runner
- ENUM'lar, tablolar, index'ler

**Kabul Kriterleri:**
- [x] `pnpm db:migrate` çalışıyor
- [x] Tüm tablolar oluşuyor (sessions, interview_configs, transcript_entries, session_events)
- [x] DB connection test edilebilir

---

### Task 1.5: Next.js Frontend Boilerplate
**Size:** M  
**Bağımlılık:** 1.1

**Açıklama:**
Basic Next.js 14 setup with Tailwind.

**Yapılacaklar:**
- `apps/web/package.json`
- Next.js 14 App Router yapısı
- Tailwind CSS setup
- shadcn/ui init
- Dark mode globals.css
- Root layout.tsx
- Root page.tsx ("Session ID gerekli" hatası)

**Kabul Kriterleri:**
- [x] `pnpm dev:web` ile frontend başlıyor
- [x] `/` sayfası "Session ID gerekli" gösteriyor
- [x] Tailwind ve dark mode çalışıyor

---

## PHASE 2: SESSION MANAGEMENT

### Task 2.1: Session Service
**Size:** M  
**Bağımlılık:** 1.4

**Açıklama:**
Session CRUD operations.

**Yapılacaklar:**
- `apps/api/src/services/sessionService.ts`
- `apps/api/src/db/queries/sessions.ts`
- `apps/api/src/db/queries/configs.ts`
- Create, get, update session functions
- Interview config save/retrieve

**Kabul Kriterleri:**
- [x] Session oluşturulabiliyor
- [x] Session getirilebiliyor
- [x] Session update edilebiliyor
- [x] Interview config kaydediliyor

---

### Task 2.2: REST API Endpoints
**Size:** M  
**Bağımlılık:** 2.1

**Açıklama:**
Session REST endpoints.

**Yapılacaklar:**
- `apps/api/src/routes/sessions.ts`
- `POST /sessions` - Create session
- `GET /sessions/:sessionId` - Get session
- `GET /sessions/:sessionId/transcript` - Get transcript
- Request validation (Zod)
- Error handling middleware

**Kabul Kriterleri:**
- [x] `POST /sessions` 201 ile sessionId dönüyor
- [x] `GET /sessions/:id` session detaylarını dönüyor
- [x] Validation hataları 400 dönüyor
- [x] Olmayan session 404 dönüyor

---

### Task 2.3: ATS Mock Endpoint
**Size:** S  
**Bağımlılık:** 2.2

**Açıklama:**
Test için mock ATS callback endpoint.

**Yapılacaklar:**
- `apps/api/src/routes/mock-ats.ts`
- `POST /mock-ats/callback` - Transcript receive endpoint
- Console log ile gelen data'yı göster

**Kabul Kriterleri:**
- [x] Callback endpoint çalışıyor
- [x] Gelen transcript loglanıyor

---

## PHASE 3: WEBSOCKET INFRASTRUCTURE

### Task 3.1: WebSocket Server Setup
**Size:** L  
**Bağımlılık:** 1.3

**Açıklama:**
Express ile WebSocket server.

**Yapılacaklar:**
- `ws` package kurulumu
- `apps/api/src/websocket/index.ts` - WS server setup
- `apps/api/src/websocket/connectionManager.ts` - Connection tracking
- Session ID ile bağlantı
- Single connection policy (yeni bağlantı eskiyi kapatır)

**Kabul Kriterleri:**
- [x] WS server çalışıyor (`ws://localhost:3001/ws`) ✅
- [x] SessionId ile bağlantı kurulabiliyor ✅
- [x] İkinci bağlantı ilkini kapatıyor ✅
- [x] `connection:ready` event gönderiliyor ✅

---

### Task 3.2: WebSocket Event Handlers
**Size:** M  
**Bağımlılık:** 3.1

**Açıklama:**
Client→Server event handling.

**Yapılacaklar:**
- `apps/api/src/websocket/handlers.ts`
- `interview:start` handler
- `interview:end` handler
- `candidate:speaking:start/end` handlers
- `candidate:interrupt` handler
- `transcript:update` handler
- Message validation

**Kabul Kriterleri:**
- [x] Tüm event'ler handle ediliyor ✅
- [x] Invalid message'lar reject ediliyor ✅
- [x] Event'ler loglara yazılıyor ✅

---

### Task 3.3: Frontend WebSocket Hook
**Size:** M  
**Bağımlılık:** 1.5

**Açıklama:**
React hook for WebSocket.

**Yapılacaklar:**
- `apps/web/src/hooks/useWebSocket.ts`
- Connect/disconnect functions
- Event sending
- Connection state tracking
- Auto-reconnect yok (MVP)

**Kabul Kriterleri:**
- [x] WS'e bağlanabiliyor ✅
- [x] Event gönderebiliyor ✅
- [x] Connection state doğru ✅

---

### Task 3.4: Zustand Store
**Size:** M  
**Bağımlılık:** 1.5

**Açıklama:**
Global state management.

**Yapılacaklar:**
- `apps/web/src/stores/interviewStore.ts`
- Session state
- Page state
- Interview state
- Transcript entries
- Timer
- All actions

**Kabul Kriterleri:**
- [x] Store oluşturuldu ✅
- [x] Tüm state'ler ve action'lar tanımlı ✅
- [x] Component'lerden erişilebilir ✅

---

## PHASE 4: INTERVIEW ENGINE

### Task 4.1: Claude Integration
**Size:** L  
**Bağımlılık:** 2.1

**Açıklama:**
Anthropic Claude API entegrasyonu.

**Yapılacaklar:**
- `@anthropic-ai/sdk` kurulumu
- `apps/api/src/services/interviewEngine.ts`
- System prompt builder
- Message formatter
- Response parser (JSON)
- Error handling

**Kabul Kriterleri:**
- [x] Claude'a request gönderebiliyor
- [x] System prompt doğru oluşuyor
- [x] Response JSON parse ediliyor
- [x] Timeout ve error handling var

---

### Task 4.2: Prompt Builder
**Size:** M  
**Bağımlılık:** 4.1

**Açıklama:**
Dynamic prompt generation.

**Yapılacaklar:**
- `apps/api/src/services/promptBuilder.ts`
- System prompt template
- User message template (her tur için)
- Position/candidate/topics injection
- Phase-aware prompting

**Kabul Kriterleri:**
- [x] System prompt doğru generate ediliyor
- [x] User message context içeriyor
- [x] Dil parametresi çalışıyor (TR/EN)

---

### Task 4.3: State Machine
**Size:** M  
**Bağımlılık:** 4.1

**Açıklama:**
Interview state management.

**Yapılacaklar:**
- `apps/api/src/services/stateMachine.ts`
- State transitions
- Phase management
- Timer tracking
- State persistence (DB)

**Kabul Kriterleri:**
- [x] State doğru değişiyor
- [x] Phase geçişleri çalışıyor
- [x] State DB'ye kaydediliyor

---

### Task 4.4: Interview Flow Integration
**Size:** L  
**Bağımlılık:** 3.2, 4.1, 4.2, 4.3

**Açıklama:**
WebSocket + Interview Engine birleşimi.

**Yapılacaklar:**
- `interview:start` → Claude'dan ilk soru
- Candidate response → Claude'a gönder → Sonraki aksiyon
- Phase change handling
- Interview end handling
- Full conversation loop

**Kabul Kriterleri:**
- [x] Görüşme başlatılabiliyor
- [x] Soru-cevap döngüsü çalışıyor
- [x] Faz değişimleri oluyor
- [x] Görüşme bitebiliyor

---

## PHASE 5: AUDIO PIPELINE

### Task 5.1: ElevenLabs TTS Service ✅
**Size:** L  
**Bağımlılık:** 4.4

**Açıklama:**
Text-to-Speech (PCM16 16kHz, full buffer yaklaşımı).

**Yapılacaklar:**
- `elevenlabs` SDK kurulumu
- `apps/api/src/services/ttsService.ts`
- Full buffer TTS request (streaming yerine)
- PCM16 16kHz format output (Simli uyumlu)
- WAV header kontrolü ve strip
- Binary WebSocket ile full audio gönderimi
- Optimized voice settings (stability: 0.65, similarity: 0.8, style: 0.15)

**Kabul Kriterleri:**
- [x] Text'i ses'e çevirebiliyor ✅
- [x] PCM16 16kHz format ✅
- [x] Full buffer olarak WS'e gönderiliyor ✅
- [x] WAV header strip ediliyor ✅
- [x] `ai:speaking:start/end` event'leri TTS sonrası gönderiliyor ✅

---

### Task 5.2: Audio Player Hook ✅ (DEPRECATED)
**Size:** M  
**Bağımlılık:** 3.3

**Açıklama:**
Frontend audio playback - **DEPRECATED** (Simli kendi audio'sunu kullanıyor).

**Yapılacaklar:**
- ~~`apps/web/src/hooks/useAudioPlayer.ts`~~ DEPRECATED
- ~~Web Audio API setup~~
- Simli'nin kendi audio elementi kullanılıyor
- useInterview.ts içinde processAudio fonksiyonu audio koordinasyonunu yapıyor

**Kabul Kriterleri:**
- [x] ~~Binary chunk'ları play edebiliyor~~ Simli yapıyor ✅
- [x] ~~Smooth playback (kesintisiz)~~ Simli yapıyor ✅
- [x] ~~Stop çalışıyor~~ clearSimliBuffer() ✅

---

### Task 5.3: Whisper STT Hook ✅
**Size:** L  
**Bağımlılık:** 3.3

**Açıklama:**
Speech-to-Text integration (OpenAI Whisper).

**Yapılacaklar:**
- `apps/web/src/hooks/useWhisper.ts`
- MediaRecorder ile ses kaydı
- Backend `/api/transcribe` endpoint
- Whisper API entegrasyonu
- Minimum 2 saniye kayıt zorunluluğu

**Kabul Kriterleri:**
- [x] Mikrofon erişimi alınabiliyor ✅
- [x] MediaRecorder çalışıyor ✅
- [x] Backend Whisper'a gönderebiliyor ✅
- [x] Transcript dönüyor ✅
- [x] Final transcript backend'e gidiyor ✅

---

### Task 5.4: Audio Pipeline Integration ✅
**Size:** L  
**Bağımlılık:** 5.1, 5.2, 5.3

**Açıklama:**
Full audio flow.

**Yapılacaklar:**
- TTS → Audio Player koordinasyonu
- STT → Backend transcript relay
- Interrupt handling
- `ai:speaking:start` → Player start
- `ai:speaking:end` → Player stop
- useInterview orchestrator hook

**Kabul Kriterleri:**
- [x] AI sorusu sesli çalıyor ✅
- [x] Aday cevabı transcript'e dönüyor ✅
- [x] Interrupt çalışıyor ✅
- [x] Full audio loop çalışıyor ✅

---

## PHASE 6: AVATAR & UI

### Task 6.1: Simli Avatar Integration ✅
**Size:** XL  
**Bağımlılık:** 5.4

**Açıklama:**
AI Avatar with lip-sync (SDK v2.0.0, PCM16 16kHz).

**Yapılacaklar:**
- `simli-client` SDK v2.0.0 kurulumu
- `apps/web/src/hooks/useSimli.ts`
- Avatar initialize (videoRef, audioRef)
- Chunked audio sending (6000 bytes, 20ms interval)
- Audio duration hesaplama
- clearSimliBuffer() for interrupt
- Simli bağlandıktan sonra interview:start

**Kabul Kriterleri:**
- [x] Avatar görünüyor ✅
- [x] TTS audio ile lip-sync yapıyor ✅
- [x] Chunked audio smooth animation ✅
- [x] Simli kendi audio'sunu playback yapıyor ✅
- [x] Idle durumunda sakin ✅
- [x] Hata durumunda graceful fallback ✅
- [x] Text-ses senkronizasyonu ✅

---

### Task 6.2: Interview Page UI
**Size:** L  
**Bağımlılık:** 3.4

**Açıklama:**
Main interview page components.

**Yapılacaklar:**
- `apps/web/src/app/interview/[sessionId]/page.tsx`
- `LoadingScreen`, `SetupScreen`, `ReadyScreen`
- `ActiveScreen`, `CompletedScreen`, `ErrorScreen`
- Page state management
- Responsive layout

**Kabul Kriterleri:**
- [x] Tüm page state'leri render ediliyor
- [x] Dark mode çalışıyor
- [x] Mobile'da düzgün görünüyor

---

### Task 6.3: Interview UI Components
**Size:** L  
**Bağımlılık:** 6.2

**Açıklama:**
Interview screen components.

**Yapılacaklar:**
- `Avatar.tsx` - Simli wrapper
- `TranscriptPanel.tsx` - Scrollable transcript
- `TranscriptEntry.tsx` - AI/Candidate mesajları
- `PhaseIndicator.tsx` - Progress gösterge
- `ControlBar.tsx` - Mic, Interrupt, End buttons
- `Timer.tsx` - Elapsed time
- `ConnectionIndicator.tsx` - Online status

**Kabul Kriterleri:**
- [x] Tüm component'ler render ediliyor
- [x] Dark mode styling
- [x] Interactive (buttons çalışıyor)

---

### Task 6.4: Full Flow Integration ✅
**Size:** XL  
**Bağımlılık:** 5.4, 6.1, 6.3

**Açıklama:**
Everything together with proper synchronization.

**Yapılacaklar:**
- `apps/web/src/hooks/useInterview.ts` - Orchestrator hook
- Mikrophone permission flow
- WebSocket connection flow
- Simli bağlandıktan SONRA interview:start
- processAudio fonksiyonu (audio → Simli koordinasyonu)
- TTS önce, text sonra (senkronizasyon)
- Audio duration hesaplama ve state geçişleri

**Kabul Kriterleri:**
- [x] Sayfa yükleniyor ✅
- [x] Mikrofon izni alınıyor ✅
- [x] WS bağlantısı kuruluyor ✅
- [x] Simli bağlandıktan sonra görüşme başlıyor ✅
- [x] İlk mesaj senkronize (text-ses) ✅
- [x] Tam döngü çalışıyor (intro → closing) ✅
- [x] Completed screen gösteriliyor ✅

---

## PHASE 7: POLISH & TEST

### Task 7.1: Transcript Service
**Size:** M  
**Bağımlılık:** 4.4

**Açıklama:**
Transcript CRUD ve ATS callback.

**Yapılacaklar:**
- `apps/api/src/db/queries/transcripts.ts` - Transcript query fonksiyonları
- Save transcript entry
- Get full transcript
- Format for ATS
- `apps/api/src/services/matchmindService.ts` - MatchMind callback sender

**Kabul Kriterleri:**
- [x] Transcript kaydediliyor
- [x] Transcript getirilebiliyor
- [x] ATS callback formatı doğru

---

### Task 7.2: Audit Logging
**Size:** M  
**Bağımlılık:** 3.2

**Açıklama:**
Event logging for monitoring.

**Yapılacaklar:**
- Console logging (inline, servisler içinde)
- DB persistence (session_events tablosu)
- Log levels (DEBUG, INFO, WARN, ERROR)

**Kabul Kriterleri:**
- [x] Önemli event'ler loglanıyor
- [x] DB'ye yazılıyor
- [x] Log format tutarlı

---

### Task 7.3: Error Handling Polish
**Size:** M  
**Bağımlılık:** 6.4

**Açıklama:**
Error states ve user feedback.

**Yapılacaklar:**
- Backend error responses standardize
- Frontend error displays
- Connection error handling
- Service error handling (Claude, ElevenLabs, Whisper)
- "Bağlantı yavaş" toast

**Kabul Kriterleri:**
- [x] Tüm hata durumları handle ediliyor
- [x] User-friendly mesajlar
- [x] Graceful degradation (avatar fallback)

---

### Task 7.4: Happy Path Test
**Size:** L  
**Bağımlılık:** 6.4, 7.1

**Açıklama:**
E2E test: Full interview cycle.

**Yapılacaklar:**
- Test session oluştur (mock ATS data)
- Interview sayfasını aç
- Görüşmeyi başlat
- 6 faz boyunca soru-cevap
- Görüşmeyi bitir
- Transcript'i kontrol et

**Kabul Kriterleri:**
- [x] Introduction → Closing tamamlanıyor
- [x] Transcript DB'de var
- [x] Tüm fazlar geçildi
- [x] Hata yok

---

## 9.2 Critical Path

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CRITICAL PATH                                      │
└─────────────────────────────────────────────────────────────────────────────┘

1.1 Monorepo ──► 1.3 Express ──► 1.4 Database ──► 2.1 Session Service
                      │
                      ▼
                 1.5 Next.js ──► 3.3 WS Hook ──► 3.4 Zustand
                      │
                      ▼
3.1 WS Server ──► 3.2 Handlers ──► 4.4 Interview Flow
                                        │
                                        ▼
4.1 Claude ──► 4.2 Prompt ──► 4.3 State ──► 5.1 TTS ──► 5.4 Audio Integration
                                                              │
                                                              ▼
                                    6.1 Simli ──► 6.4 Full Integration ──► 7.4 Test
```

---

## 9.3 Paralel Yapılabilecekler

| Paralel Grup | Task'lar |
|--------------|----------|
| **Foundation** | 1.3 (Backend) + 1.5 (Frontend) paralel |
| **Session** | 2.2 (API) + 2.3 (Mock ATS) paralel |
| **WebSocket** | 3.1-3.2 (Backend) + 3.3-3.4 (Frontend) paralel |
| **Audio** | 5.2 (Player) + 5.3 (Whisper) paralel (5.1 sonrası) |
| **UI** | 6.2-6.3 (UI Components) + 6.1 (Simli) paralel |
| **Polish** | 7.1, 7.2, 7.3 paralel |

---

## 9.4 Task Summary

| Phase | Task Count | Total Size |
|-------|------------|------------|
| Phase 1: Foundation | 5 | M + S + M + L + M |
| Phase 2: Session | 3 | M + M + S |
| Phase 3: WebSocket | 4 | L + M + M + M |
| Phase 4: Interview Engine | 4 | L + M + M + L |
| Phase 5: Audio Pipeline | 4 | L + M + L + L |
| Phase 6: Avatar & UI | 4 | XL + L + L + XL |
| Phase 7: Polish & Test | 4 | M + M + M + L |
| **TOTAL** | **28 tasks** | |

---

## 9.5 Kesinleşen Kararlar

| Karar | Değer |
|-------|-------|
| Approach | Backend-first |
| External services order | Claude → ElevenLabs → Whisper → Simli |
| STT | OpenAI Whisper (Deepgram'dan geçildi) |
| TTS | ElevenLabs PCM16 16kHz, full buffer |
| Avatar | Simli SDK v2.0.0, chunked audio (6000 bytes, 20ms) |
| Audio Playback | Simli kendi audio'sunu kullanıyor |
| Senkronizasyon | TTS önce, ai:speaking:start sonra |
| ATS | Mock ile başla |
| Test focus | Full interview cycle (intro → closing) |
| Vibe coding uyumlu | Net task'lar, clear acceptance criteria |

---

**Önceki Bölüm:** [08-security-auth.md](./08-security-auth.md)

---

## 🎉 PLANLAMA TAMAMLANDI

Tüm 9 bölüm hazır. Bir sonraki adım:
1. Vibe coding workflow tanımı
2. Cursor rules oluşturma
3. Implementation başlangıcı
