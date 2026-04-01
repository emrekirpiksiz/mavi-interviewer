# Feature: Session Resilience - WebSocket Reconnection & Hata Yönetimi

> **Öncelik:** Yüksek  
> **Tahmini Effort:** L  
> **Bağımlılıklar:** Mevcut WebSocket altyapısı, StateMachine DB persistence, ConnectionManager  
> **Tarih:** 2026-02-07

---

## Problem / Motivasyon

Production ortamında aşağıdaki senaryolar sıkça yaşanabilir:

1. **Tarayıcı kapanması/crash:** Kullanıcı yanlışlıkla tarayıcıyı kapatır veya tarayıcı crash olur
2. **Sayfa yenileme (refresh):** Mikrofon algılamıyor, ses sorunu var → kullanıcı sayfayı yeniler
3. **Farklı tarayıcıdan devam:** Chrome'da sorun var → Safari'den aynı URL ile devam etmek ister
4. **Ağ kesintisi:** Kısa süreli internet kopması

Bu durumlarda:
- Görüşme **anlamlı bir yerden devam** edebilmeli
- Session başına **tek WebSocket** garantisi korunmalı
- Tüm reconnect ve hata olayları **DB seviyesinde loglanmalı**
- Tamamlanamayan session'lar **izlenebilir** olmalı

### Mevcut Durum Analizi

Halihazırda kısmen desteklenen özellikler:

| Özellik | Durum | Eksik |
|---------|-------|-------|
| Tek WS politikası (connectionManager) | ✅ Var | Takeover loglama yok |
| Exponential backoff reconnect (useWebSocket) | ✅ Var (5 deneme) | Sayfa refresh akışı eksik |
| State DB persistence (stateMachine) | ✅ Var | Reconnect sonrası state recovery yetersiz |
| Transcript yükleme (reconnect) | ✅ Var | AI son mesaj tekrar söylenmiyor |
| session_events tablosu | ✅ Var | Aktif kullanılmıyor |
| Reconnect UI | ⚠️ Kısmi | Sadece system message, avatar init bekleme yok |
| Browser close detection | ❌ Yok | - |
| Hata/reconnect DB loglama | ❌ Yok | - |

---

## Çözüm Yaklaşımı

### Genel Akış Diyagramı

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SESSION RESILIENCE - RECONNECT AKIŞI                     │
└─────────────────────────────────────────────────────────────────────────────┘

  Senaryo 1: Sayfa Refresh
  ─────────────────────────
  [Sayfa Refresh / beforeunload]
       │
       │ navigator.sendBeacon → Backend log: browser_close
       ▼
  [Sayfa Yeniden Yükleniyor]
       │
       ▼
  [Interview Page Mount]
       │
       ├── GET /sessions/:sessionId → status: 'active' ?
       │
       │   ✅ Evet (aktif session)
       │   ▼
       │   pageState: 'reconnecting'
       │   ┌─────────────────────────────────────┐
       │   │   ReconnectingScreen                 │
       │   │   "Görüşmeye yeniden bağlanılıyor..."│
       │   │   [Progress indicator]               │
       │   └─────────────────────────────────────┘
       │       │
       │       ├── 1. WebSocket bağlantısı kur
       │       │      connection:ready (isReconnect: true)
       │       │      → Transcript yükle
       │       │
       │       ├── 2. Simli Avatar initialize et
       │       │      → WebRTC bağlantısı
       │       │      → simliReady = true
       │       │
       │       ├── 3. Her ikisi de hazır olunca:
       │       │      → interview:resume event gönder
       │       │
       │       └── 4. Backend: Son AI mesajını tekrar gönder
       │              → TTS generate → Audio gönder
       │              → ai:speaking:start event
       │              → Avatar lip-sync + ses
       │              → WAITING_FOR_CANDIDATE
       │
       │   ❌ Hayır (pending / completed / failed)
       │   ▼
       │   Normal akış (setup / completed / error)
       │
       ▼
  [Görüşme Devam Ediyor]


  Senaryo 2: Farklı Tarayıcıdan Açma (Cross-Browser Takeover)
  ────────────────────────────────────────────────────────────
  [Chrome: Aktif session]          [Safari: Aynı URL'yi açıyor]
       │                                  │
       │                                  ├── GET /sessions/:id → active
       │                                  │
       │                                  ├── WS bağlantısı kur
       │                                  │
       │                    ┌──────────────┤
       │                    │ ConnectionManager:
       │                    │ Chrome WS kapat (code: 4010)
       │                    │ Safari WS kaydet
       │                    │ Log: session_takeover event
       │                    └──────────────┤
       │                                  │
       │◄── WS close (4010)               ├── connection:ready (isReconnect)
       │                                  │
       ▼                                  ▼
  ┌──────────────────┐           ┌──────────────────────┐
  │ "Başka bir        │           │ Reconnect akışı       │
  │  tarayıcıdan      │           │ (Senaryo 1 ile aynı)  │
  │  bağlanıldı"      │           └──────────────────────┘
  │  [Yeniden Bağlan]  │
  └──────────────────┘


  Senaryo 3: Ağ Kesintisi (Mevcut Otomatik Reconnect)
  ────────────────────────────────────────────────────
  [WS koptu]
       │
       ├── Backend: connection_lost log
       │
       ▼
  [useWebSocket: Exponential Backoff]
       │
       ├── Deneme 1 (1s) → Başarısız
       ├── Deneme 2 (2s) → Başarısız
       ├── Deneme 3 (4s) → Başarılı ✅
       │
       ▼
  [Reconnect akışı başlar]
       │
       ├── Backend: connection_restored log
       ▼
  [Senaryo 1 ile aynı akış]
```

---

## Detaylı Teknik Tasarım

### Part 1: Backend - Reconnection Enhancement

#### 1.1 Yeni WebSocket Event: `interview:resume`

Frontend, hem WS bağlantısı hem de Simli avatar hazır olduktan sonra bu event'i gönderir.

```typescript
// Client → Server
{
  "event": "interview:resume",
  "data": {}
}
```

**Handler Davranışı:**
1. Session state'i kontrol et
2. Transcript'ten son entry'yi bul
3. Son AI mesajını belirle:
   - Son transcript entry `ai` ise → o mesajı tekrar gönder
   - Son transcript entry `candidate` ise → yeni AI yanıtı üret
   - Transcript boşsa (session henüz başlamamış ama status active) → ilk soruyu üret
4. TTS generate et → audio gönder → `ai:speaking:start` event
5. State'i güncelle

```typescript
// handlers.ts - Yeni handler
async function handleInterviewResume(sessionId: string, ws: WebSocket): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) {
    sendError(ws, 'SESSION_NOT_FOUND', 'Session state bulunamadı', false);
    return;
  }

  // Log reconnect resume event
  await logSessionEvent(sessionId, 'interview_resumed', {
    previousState: state.state,
    phase: state.phase,
  });

  // Transcript'ten son entry'yi bul
  const lastEntry = await getLastTranscriptEntry(sessionId);

  if (!lastEntry) {
    // Transcript boş - görüşme başlamış ama mesaj yok (edge case)
    // İlk soruyu tekrar üret
    await regenerateFirstQuestion(sessionId, ws);
    return;
  }

  if (lastEntry.speaker === 'ai') {
    // Son mesaj AI'dan - tekrar gönder (TTS + avatar)
    await resendLastAIMessage(sessionId, ws, lastEntry.content, state);
  } else {
    // Son mesaj candidate'den - AI yanıt üretmeli
    await generateNewAIResponse(sessionId, ws, state);
  }
}
```

#### 1.2 Son AI Mesajını Tekrar Gönderme

```typescript
async function resendLastAIMessage(
  sessionId: string,
  ws: WebSocket,
  message: string,
  state: SessionState
): Promise<void> {
  // State'i AI_SPEAKING'e geçir
  updateState(sessionId, 'AI_SPEAKING');

  // TTS generate et
  try {
    await streamTTS(sessionId, message);
  } catch (error) {
    console.error(`[Handler] Session ${sessionId} - TTS error on resume:`, error);
    await logSessionEvent(sessionId, 'error_occurred', {
      error: 'TTS error on resume',
      service: 'elevenlabs',
    });
  }

  // ai:speaking:start event gönder
  const aiStartEvent = {
    event: 'ai:speaking:start',
    data: {
      text: message,
      phase: state.phase,
      topic: null,
      reasoning: null,
      turn: 'candidate', // Reconnect sonrası her zaman candidate turn
    }
  };
  connectionManager.send(sessionId, aiStartEvent);

  // ai:speaking:end
  connectionManager.send(sessionId, { event: 'ai:speaking:end', data: {} });

  // WAITING_FOR_CANDIDATE'e geçiş
  updateState(sessionId, 'WAITING_FOR_CANDIDATE');
}
```

#### 1.3 Session Event Logging

`session_events` tablosuna aktif loglama eklenmesi. Yeni event tipleri:

| Event Type | Açıklama | Event Data |
|------------|----------|------------|
| `connection_established` | İlk bağlantı kuruldu | `{ip, userAgent, isReconnect: false}` |
| `connection_lost` | Bağlantı beklenmedik şekilde koptu | `{closeCode, closeReason, lastState, ip}` |
| `connection_restored` | Yeniden bağlantı kuruldu | `{ip, userAgent, reconnectNumber, previousDisconnectAt}` |
| `session_takeover` | Farklı tarayıcı/cihaz devir aldı | `{oldIp, newIp, oldUserAgent, newUserAgent}` |
| `browser_close_detected` | Tarayıcı kapanma tespit edildi | `{ip, userAgent, method: 'beacon'/'ws_close'}` |
| `interview_resumed` | Görüşme reconnect sonrası devam etti | `{previousState, phase, transcriptCount}` |
| `reconnect_failed` | Reconnect başarısız | `{attemptNumber, reason}` |
| `error_occurred` | Hata oluştu (mevcut, genişletildi) | `{error, service, context, recoverable}` |

```typescript
// Yeni: sessionEventService.ts veya mevcut query dosyasına ekleme
async function logSessionEvent(
  sessionId: string,
  eventType: string,
  eventData?: Record<string, unknown>
): Promise<void> {
  try {
    await pool.query(
      'INSERT INTO session_events (session_id, event_type, event_data) VALUES ($1, $2, $3)',
      [sessionId, eventType, eventData ? JSON.stringify(eventData) : null]
    );
  } catch (error) {
    console.error(`[SessionEvents] Failed to log event ${eventType}:`, error);
    // Loglama hatası görüşmeyi engellememeli
  }
}
```

#### 1.4 ConnectionManager Geliştirmesi

```typescript
interface ConnectionInfo {
  ws: WebSocket;
  sessionId: string;
  connectedAt: Date;
  ip: string;           // YENİ
  userAgent: string;     // YENİ
  reconnectCount: number; // YENİ
}
```

Bağlantı değiştirilirken (takeover):
- Eski bağlantıyı **4010** koduyla kapat ("Session taken over by another client")
- `session_takeover` event'i logla
- Yeni bağlantı bilgilerini kaydet

#### 1.5 WebSocket Close Handler Geliştirmesi

```typescript
// websocket/index.ts - close handler
ws.on('close', async (code, reason) => {
  console.log(`[WebSocket] Session ${sessionId} - Connection closed (code: ${code})`);

  // Takeover değilse (takeover'da yeni bağlantı zaten logladı)
  if (code !== 4010) {
    // Bağlantı kopma sebebini logla
    const closeReason = getCloseReason(code);
    await logSessionEvent(sessionId, 'connection_lost', {
      closeCode: code,
      closeReason: closeReason,
      lastState: getSessionState(sessionId)?.state,
      ip,
      userAgent: request.headers['user-agent'],
    });
  }

  connectionManager.remove(sessionId);
  // NOT: cleanupSession artık koşullu çağrılacak
  // Aktif session'larda state'i silmiyoruz (reconnect için)
  handleSessionDisconnect(sessionId, code);
});
```

#### 1.6 State Cleanup Stratejisi Değişikliği

**Kritik Değişiklik:** Aktif session'larda WS kapandığında in-memory state'i silmemeli. Sadece systemPromptCache temizlenebilir (reconnect'te yeniden oluşturulacak).

```typescript
function handleSessionDisconnect(sessionId: string, closeCode: number): void {
  // System prompt cache'i her zaman temizle (reconnect'te rebuild edilir)
  systemPromptCache.delete(sessionId);
  messageCounters.delete(sessionId);

  // Sadece tamamlanmış/başarısız session'larda state'i temizle
  // Aktif session'lar reconnect edebilir, state DB'den yüklenecek
  const state = getSessionState(sessionId);
  if (state && (state.state === 'COMPLETED')) {
    cleanupSessionState(sessionId);
  }
  // Diğer state'lerde in-memory state'i temizle ama DB'deki state kalır
  // loadStateFromDb ile reconnect'te geri yüklenecek
  if (state && state.state !== 'COMPLETED') {
    cleanupSessionState(sessionId); // In-memory temizle
    // DB'deki state korunuyor (saveStateToDb zaten her update'te yazıyor)
  }
}
```

#### 1.7 Browser Close Detection Endpoint

```typescript
// routes/sessions.ts - Yeni endpoint
router.post('/sessions/:sessionId/disconnect', async (req, res) => {
  const { sessionId } = req.params;
  const { reason } = req.body;

  await logSessionEvent(sessionId, 'browser_close_detected', {
    reason: reason || 'browser_close',
    method: 'beacon',
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({ success: true });
});
```

#### 1.8 State Machine - Reconnect Geçiş Kuralları

State machine'e reconnect'e özel geçişler eklenmeli:

```typescript
// Reconnect sonrası state recovery
// interview:resume handler'ında kullanılacak
function getReconnectState(savedState: InterviewState): InterviewState {
  switch (savedState) {
    case 'AI_GENERATING':
    case 'AI_SPEAKING':
    case 'WAITING_FOR_CANDIDATE':
    case 'CANDIDATE_SPEAKING':
    case 'PROCESSING':
      // Tüm aktif state'ler → AI_SPEAKING'e geçecek (son mesaj tekrar)
      return 'AI_SPEAKING';
    case 'COMPLETED':
      return 'COMPLETED';
    default:
      return 'READY';
  }
}
```

`VALID_TRANSITIONS` güncellenmesi:

```typescript
const VALID_TRANSITIONS: Record<InterviewState, InterviewState[]> = {
  // ... mevcut transitions ...
  // Reconnect için ek geçişler:
  CANDIDATE_SPEAKING: ['PROCESSING', 'AI_SPEAKING'],  // + AI_SPEAKING (reconnect)
  PROCESSING: ['AI_GENERATING', 'AI_SPEAKING', 'COMPLETED'],  // + AI_SPEAKING (reconnect)
  AI_GENERATING: ['AI_SPEAKING', 'COMPLETED'],  // zaten var
};
```

---

### Part 2: Frontend - Reconnection UX

#### 2.1 Yeni Page State: `reconnecting`

```typescript
// interviewStore.ts
type PageState = 'loading' | 'setup' | 'ready' | 'active' | 'reconnecting' | 'completed' | 'error';
```

#### 2.2 Reconnect Akışı (Interview Page)

```typescript
// app/interview/[sessionId]/page.tsx
// Sayfa yüklendiğinde:
useEffect(() => {
  async function init() {
    const response = await fetch(`/api/sessions/${sessionId}`);
    const session = await response.json();

    if (session.data.status === 'active') {
      // Aktif session - reconnect akışı
      setPageState('reconnecting');
      // WS bağlantısını kur (mevcut connect fonksiyonu)
      connect(sessionId);
    } else if (session.data.status === 'pending') {
      // Normal akış
      setPageState('loading');
      connect(sessionId);
    } else {
      // completed / failed
      setPageState('completed'); // veya error
    }
  }
  init();
}, [sessionId]);
```

#### 2.3 ReconnectingScreen Komponenti

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    🔄 (Animasyonlu ikon)                    │
│                                                             │
│             Görüşmeye Yeniden Bağlanılıyor...               │
│                                                             │
│     ┌─────────────────────────────────────────────┐         │
│     │ ✅ Sunucu bağlantısı kuruldu                │         │
│     │ ⏳ Avatar hazırlanıyor...                   │         │
│     │ ○  Görüşme devam edecek                     │         │
│     └─────────────────────────────────────────────┘         │
│                                                             │
│          Bu işlem birkaç saniye sürebilir.                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Adımlar (checkbox/progress):**
1. ✅ Sunucu bağlantısı kuruldu (WS connected)
2. ✅ Görüşme bilgileri yüklendi (transcript loaded)
3. ⏳ Avatar hazırlanıyor... (Simli initializing)
4. ○ Görüşme devam edecek (interview:resume sent)

#### 2.4 useInterview - Resume Akışı

```typescript
// useInterview.ts - Reconnect sonrası resume
function handleReconnectResume() {
  // Bu fonksiyon:
  // 1. Simli avatar'ı initialize eder
  // 2. Simli ready olunca interview:resume gönderir
  // 3. pageState'i 'active' yapar

  // Simli init
  initializeSimli();

  // Simli ready callback'inde:
  onSimliReady(() => {
    // interview:resume event gönder
    send({ event: 'interview:resume', data: {} });
    // Active state'e geç
    setPageState('active');
  });
}
```

#### 2.5 useWebSocket - handleConnectionReady Güncelleme

```typescript
const handleConnectionReady = useCallback((message: WSConnectionReadyEvent) => {
  // ... mevcut session/config set logic ...

  if (data.isReconnect && data.status === 'active') {
    // Reconnect akışı
    setIsReconnect(true);

    // Transcript yükle
    if (data.existingTranscript?.length > 0) {
      loadExistingTranscript(data.existingTranscript);
    }

    // Elapsed time restore
    if (data.elapsedSeconds) {
      setElapsedSeconds(data.elapsedSeconds);
    }

    // ÖNEMLİ: Direkt 'active'e GEÇMİYORUZ
    // 'reconnecting' state'inde kalıyoruz
    // Simli avatar hazır olunca 'active'e geçilecek
    // (ReconnectingScreen bu adımları yönetecek)

    setReconnectStep('ws_connected'); // Progress tracking

  } else {
    // Normal bağlantı akışı (mevcut kod)
    setIsReconnect(false);
    if (currentState === 'loading') {
      setPageState('setup');
    }
  }
}, [...]);
```

#### 2.6 Browser Close Detection

```typescript
// useWebSocket.ts veya interview page'de
useEffect(() => {
  const handleBeforeUnload = () => {
    if (sessionIdRef.current) {
      // Beacon ile backend'e bildir
      navigator.sendBeacon(
        `${API_URL}/sessions/${sessionIdRef.current}/disconnect`,
        JSON.stringify({ reason: 'browser_close' })
      );
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden' && sessionIdRef.current) {
      // Sayfa gizlendiğinde log (tab kapatma, minimize vb.)
      // Bu her tab switch'te de tetiklenir, dikkatli kullanılmalı
      // Sadece loglama amaçlı
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}, []);
```

#### 2.7 Session Takeover UI (Eski Tarayıcı)

WS close code **4010** alındığında özel mesaj:

```typescript
// useWebSocket.ts - onclose handler
ws.onclose = (event) => {
  if (event.code === 4010) {
    // Session takeover - başka tarayıcıdan bağlanıldı
    setError(null); // Normal hata gösterme
    setPageState('taken_over'); // Yeni state
    setSystemMessage('Bu görüşme başka bir tarayıcıdan devam ettiriliyor.');
    return; // Reconnect deneme
  }
  // ... mevcut close logic ...
};
```

**TakenOverScreen:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    ⚠️                                       │
│                                                             │
│      Bu görüşme başka bir tarayıcıdan                       │
│      devam ettiriliyor.                                     │
│                                                             │
│      Eğer bağlantı siz değilseniz,                          │
│      aşağıdaki butona tıklayarak                            │
│      tekrar bağlanabilirsiniz.                              │
│                                                             │
│          [Yeniden Bağlan]                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### Part 3: Rate Limiting Değerlendirmesi

Mevcut rate limiting değerleri reconnect senaryoları için yeterli:

| Limit | Mevcut Değer | Reconnect Etkisi | Değişiklik |
|-------|-------------|------------------|------------|
| WS bağlantı | 10/dk per IP | Sayfa refresh → her refresh 1 bağlantı. 10 refresh/dk yeterli | ❌ Değişiklik yok |
| WS mesaj | 60/dk per session | interview:resume ek 1 mesaj. Etki minimal | ❌ Değişiklik yok |
| Beacon endpoint | Yok | Yeni endpoint, sadece disconnect bildirimi | ⚠️ Basit rate limit eklenebilir (50/dk per IP) |

**Beacon endpoint için basit koruma:**
- Sadece valid UUID sessionId kabul et
- IP bazlı basit rate limit (mevcut express-rate-limit middleware ile)
- Request body minimal (sadece reason string)

---

### Part 4: Monitoring Sorguları

Production'da session sorunlarını izlemek için kullanılacak sorgular:

```sql
-- 1. Çok fazla reconnect olan session'lar (sorunlu session'lar)
SELECT 
  se.session_id,
  ic.candidate_data->>'name' as candidate_name,
  COUNT(*) FILTER (WHERE se.event_type = 'connection_restored') as reconnect_count,
  COUNT(*) FILTER (WHERE se.event_type = 'error_occurred') as error_count,
  s.status,
  s.created_at
FROM session_events se
JOIN sessions s ON se.session_id = s.id
JOIN interview_configs ic ON s.id = ic.session_id
WHERE se.event_type IN ('connection_restored', 'error_occurred', 'connection_lost')
GROUP BY se.session_id, ic.candidate_data, s.status, s.created_at
HAVING COUNT(*) FILTER (WHERE se.event_type = 'connection_restored') > 2
ORDER BY reconnect_count DESC;

-- 2. Tamamlanamayan session'lar (hata ile biten veya aktif kalan)
SELECT 
  s.id as session_id,
  ic.candidate_data->>'name' as candidate_name,
  ic.position_data->>'title' as position_title,
  s.status,
  s.started_at,
  s.created_at,
  NOW() - s.started_at as duration,
  (SELECT COUNT(*) FROM session_events 
   WHERE session_id = s.id AND event_type = 'connection_lost') as disconnect_count,
  (SELECT event_data FROM session_events 
   WHERE session_id = s.id AND event_type = 'error_occurred'
   ORDER BY created_at DESC LIMIT 1) as last_error
FROM sessions s
JOIN interview_configs ic ON s.id = ic.session_id
WHERE s.status IN ('active', 'failed')
  AND s.created_at > NOW() - INTERVAL '24 hours'
ORDER BY s.created_at DESC;

-- 3. Belirli bir session'ın tüm event geçmişi
SELECT 
  event_type,
  event_data,
  created_at
FROM session_events
WHERE session_id = $1
ORDER BY created_at ASC;
```

---

## Etkilenen Dosyalar

### Backend

| Dosya | Değişiklik |
|-------|-----------|
| `apps/api/src/websocket/handlers.ts` | `interview:resume` handler, VALID_EVENTS güncelleme, `handleSessionDisconnect` |
| `apps/api/src/websocket/index.ts` | Close handler'da event loglama, connection metadata kaydetme |
| `apps/api/src/websocket/connectionManager.ts` | ConnectionInfo genişletme (ip, userAgent, reconnectCount), takeover close code 4010 |
| `apps/api/src/services/stateMachine.ts` | Reconnect state geçişleri, VALID_TRANSITIONS güncelleme |
| `apps/api/src/services/sessionEventService.ts` | **YENİ** - Session event loglama servisi |
| `apps/api/src/db/queries/sessionEvents.ts` | **YENİ** - Session events DB sorguları |
| `apps/api/src/db/queries/transcripts.ts` | `getLastTranscriptEntry` fonksiyonu ekleme |
| `apps/api/src/routes/sessions.ts` | `/sessions/:sessionId/disconnect` beacon endpoint |

### Frontend

| Dosya | Değişiklik |
|-------|-----------|
| `apps/web/src/hooks/useWebSocket.ts` | handleConnectionReady reconnect akışı, close code 4010, beforeunload |
| `apps/web/src/hooks/useInterview.ts` | Resume akışı (Simli init → interview:resume), reconnect orchestration |
| `apps/web/src/stores/interviewStore.ts` | `reconnecting` pageState, `taken_over` state, reconnectStep tracking |
| `apps/web/src/components/ReconnectingScreen.tsx` | **YENİ** - Yeniden bağlanma ekranı |
| `apps/web/src/components/TakenOverScreen.tsx` | **YENİ** - Session takeover ekranı |
| `apps/web/src/app/interview/[sessionId]/page.tsx` | Reconnecting/TakenOver state render, session status kontrolü |

### Shared

| Dosya | Değişiklik |
|-------|-----------|
| `packages/shared/src/types/websocket.ts` | `interview:resume` event type, PageState tipi güncelleme |

---

## Kabul Kriterleri

### Temel Reconnect

- [ ] Sayfa refresh yapıldığında aktif session otomatik algılanır ve reconnect akışı başlar
- [ ] Reconnect sırasında "Yeniden Bağlanılıyor..." ekranı gösterilir (adım adım progress)
- [ ] WebSocket bağlantısı + Simli avatar hazır olduktan sonra `interview:resume` gönderilir
- [ ] AI son mesajını TTS + avatar ile tekrar söyler
- [ ] Mevcut transcript ekranda gösterilir (tüm geçmiş konuşma)
- [ ] Görüşme kaldığı yerden devam eder (candidate yanıt verebilir)

### Cross-Browser Takeover

- [ ] Farklı tarayıcıdan aynı URL açıldığında eski bağlantı kesilir (code 4010)
- [ ] Eski tarayıcıda "Başka tarayıcıdan devam ettiriliyor" mesajı gösterilir
- [ ] Yeni tarayıcıda reconnect akışı çalışır
- [ ] Eski tarayıcıda "Yeniden Bağlan" butonu ile geri alınabilir

### Hata/Event Loglama

- [ ] Her WS bağlantısı kurulduğunda `connection_established` veya `connection_restored` loglanır
- [ ] Her WS kopmasında `connection_lost` loglanır (close code, reason, last state)
- [ ] Session takeover'ları `session_takeover` olarak loglanır
- [ ] Browser kapanma `browser_close_detected` olarak loglanır (best-effort)
- [ ] `interview:resume` başarılı olduğunda `interview_resumed` loglanır
- [ ] Tüm hatalar `error_occurred` ile loglanır (servis, context bilgisi ile)

### Edge Case'ler

- [ ] AI konuşurken (AI_SPEAKING) bağlantı koparsa → reconnect'te son mesaj tekrar söylenir
- [ ] AI düşünürken (AI_GENERATING) bağlantı koparsa → reconnect'te transcript'e göre doğru aksiyon alınır
- [ ] Candidate konuşurken bağlantı koparsa → reconnect'te son AI mesajı tekrar söylenir (kayıt kaybolur, kullanıcı tekrar yanıt verir)
- [ ] Session completed iken URL'ye girerse → completed ekranı gösterilir
- [ ] Simli avatar reconnect'te başarısız olursa → hata gösterilir, avatarsız devam ETMEZx, tekrar deneme seçeneği sunulur

### Rate Limiting

- [ ] Mevcut WS connection rate limit (10/dk per IP) reconnect senaryolarında yeterli
- [ ] Beacon disconnect endpoint'e basit rate limit uygulanır
- [ ] Reconnect döngüsüne girme riski yok (exponential backoff korunur)

---

## Uygulama Sırası (Önerilen)

### Adım 1: Backend Event Loglama Altyapısı
1. `sessionEventService.ts` oluştur
2. `session_events` DB query fonksiyonları
3. Mevcut WS handler'lara loglama ekle (connection, close, error)

### Adım 2: Backend Reconnect Handler
1. `interview:resume` event handler'ı ekle
2. Son AI mesajı resend mekanizması
3. State machine reconnect geçişleri
4. ConnectionManager metadata + takeover (code 4010)

### Adım 3: Backend Beacon Endpoint
1. `/sessions/:sessionId/disconnect` POST endpoint
2. Basit rate limit

### Adım 4: Frontend Reconnect Akışı
1. `interviewStore` güncelleme (yeni state'ler)
2. `useWebSocket` reconnect akışı güncelleme
3. `useInterview` resume orchestration
4. Interview page - aktif session algılama

### Adım 5: Frontend UI Komponentleri
1. `ReconnectingScreen` komponenti
2. `TakenOverScreen` komponenti
3. Interview page render logic

### Adım 6: Browser Close Detection
1. `beforeunload` + `sendBeacon`
2. Frontend cleanup

### Adım 7: Shared Types
1. Yeni event type'ları
2. PageState güncellemesi

---

## Notlar

### Kararlar

| Karar | Değer | Gerekçe |
|-------|-------|---------|
| Reconnect'te AI davranışı | Son mesajı tekrar söyle (TTS + avatar) | Kullanıcı anlamlı yerden devam edebilmeli |
| Avatar reconnect | Zorunlu (avatarsız devam yok) | Kullanıcı deneyimi tutarlılığı |
| Takeover close code | 4010 (custom) | 4000'den ayırt edilebilir, mevcut 4000 genel "replaced" |
| Reconnect limiti | Sınırsız (rate limit geçerli) | Kullanıcı dostu, rate limit yeterli koruma sağlar |
| Browser close detection | sendBeacon (best-effort) | Güvenilir ama %100 garanti yok |
| Admin paneli | Şimdilik yok, sadece DB | İleride eklenecek, SQL sorguları yeterli |

### Riskler

| Risk | Olasılık | Etki | Mitigation |
|------|----------|------|------------|
| Simli avatar reconnect'te uzun süre init olabilir | Orta | UX gecikme | Timeout + kullanıcıya bilgi | 
| TTS regeneration ek maliyet | Düşük | API maliyeti | Reconnect sayısı genelde az |
| sendBeacon browser desteği | Düşük | Loglama eksik | Fallback: WS close code analizi |
| Race condition: iki tarayıcı aynı anda bağlanırsa | Düşük | Hangi bağlanır? | ConnectionManager son gelen kazanır (mevcut politika) |

### İlişkili Dokümanlar

- `docs/plans/01-system-architecture.md` - §1.5 WebSocket Bağlantı Mimarisi, §1.6 Error Handling
- `docs/plans/02-database-design.md` - §2.3.4 session_events tablosu
- `docs/plans/03-api-design.md` - §3.3 WebSocket API, §3.5 Error Codes
- `docs/plans/06-realtime-pipeline.md` - §6.3 Görüşme Başlatma Akışı
- `docs/features/security-hardening.md` - Rate limiting referansı

---

*Implementation tamamlandı: 2026-02-07*
