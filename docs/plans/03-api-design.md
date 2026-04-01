# BÖLÜM 3: API DESIGN

> **Versiyon:** 1.1  
> **Son Güncelleme:** 2026-02-07  
> **Durum:** ✅ Onaylandı (API Key Auth + Rate Limiting eklendi)

---

## 3.1 Genel Bakış

Interview API iki ana iletişim kanalı sunar:
1. **REST API:** Session yönetimi (ATS entegrasyonu)
2. **WebSocket:** Realtime görüşme iletişimi

### Base URLs
```
REST API:    https://api.interview.example.com
WebSocket:   wss://api.interview.example.com/ws
Development: http://localhost:3001
```

---

## 3.2 REST API Endpoints

### Endpoint Özeti

| Method | Endpoint | Açıklama | Çağıran |
|--------|----------|----------|---------|
| `POST` | `/sessions` | Yeni session oluştur | ATS |
| `GET` | `/sessions/:sessionId` | Session detayı | Frontend / ATS |
| `GET` | `/sessions/:sessionId/transcript` | Transcript getir | ATS |
| `POST` | `/demo-session` | Demo session oluştur (access code ile) | Frontend |
| `POST` | `/transcribe` | Audio transcription (Whisper) | Frontend |
| `POST` | `/mock-ats/callback` | Mock ATS callback (test) | Backend |
| `POST` | `/sessions/:sessionId/disconnect` | Browser close detection (beacon) | Frontend |
| `GET` | `/health` | Sağlık kontrolü | Monitoring |

---

### 3.2.1 `POST /sessions` - Session Oluştur

ATS görüşme planladığında bu endpoint'i çağırır.

**Authentication:** `X-API-Key` header gereklidir.  
**Rate Limit:** 10 req/dk per IP

**Headers:**
```
Content-Type: application/json
X-API-Key: {ATS_API_KEY}
```

**Request:**
```json
{
  "position": {
    "company": {
      "name": "TechCorp",
      "industry": "E-ticaret",
      "size": "200-500 çalışan",
      "tech_stack": ["React", "Node.js", "PostgreSQL", "AWS"]
    },
    "title": "Senior Frontend Developer",
    "responsibilities": [
      "React ve TypeScript ile karmaşık UI componentleri geliştirme",
      "Sayfa performans optimizasyonları yapma"
    ],
    "requirements": [
      "En az 4 yıl frontend geliştirme deneyimi",
      "React ile en az 3 yıl deneyim"
    ]
  },
  "interview_topics": [
    {
      "category": "technical",
      "topic": "React",
      "description": "React hooks, component lifecycle, state management",
      "scoring": {
        "scale": "0-10",
        "minimum_expected": 7,
        "importance": "olmazsa_olmaz"
      },
      "evaluation_guide": "Hooks kullanımı, useEffect dependency array..."
    }
  ],
  "candidate": {
    "name": "Ahmet Yılmaz",
    "experiences": [
      {
        "title": "Senior Frontend Developer",
        "company": "TechMart",
        "duration": "Mart 2022 - Halen",
        "description": "2M+ aktif kullanıcılı e-ticaret platformunda..."
      }
    ],
    "education": [
      {
        "degree": "Lisans - Bilgisayar Mühendisliği",
        "school": "ODTÜ",
        "duration": "2014 - 2018"
      }
    ],
    "skills": ["React (4.5 yıl)", "TypeScript (3 yıl)"]
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "joinUrl": "https://interview.example.com/interview/550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "createdAt": "2026-01-23T10:00:00Z"
  }
}
```

**Errors:**
- `400` - Validation error (eksik/hatalı field)
- `401` - Unauthorized (eksik veya geçersiz API key)
- `429` - Too Many Requests (rate limit aşıldı)
- `500` - Internal server error

---

### 3.2.2 `GET /sessions/:sessionId` - Session Detayı

Session bilgilerini getirir. Frontend sayfa yüklemesinde kullanılabilir.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "currentPhase": "introduction",
    "currentQuestionIndex": 0,
    "startedAt": null,
    "endedAt": null,
    "createdAt": "2026-01-23T10:00:00Z",
    "candidate": {
      "name": "Ahmet Yılmaz"
    },
    "position": {
      "title": "Senior Frontend Developer",
      "company": "TechCorp"
    }
  }
}
```

**Errors:**
- `404` - Session not found

---

### 3.2.3 `GET /sessions/:sessionId/transcript` - Transcript Getir

Tamamlanmış görüşmenin transcript'ini getirir.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "candidate": {
      "name": "Ahmet Yılmaz"
    },
    "position": {
      "title": "Senior Frontend Developer",
      "company": "TechCorp"
    },
    "duration": {
      "startedAt": "2026-01-23T10:05:00Z",
      "endedAt": "2026-01-23T10:45:00Z",
      "totalMinutes": 40
    },
    "entries": [
      {
        "sequence": 1,
        "speaker": "ai",
        "content": "Merhaba Ahmet, TechCorp Senior Frontend Developer pozisyonu için görüşmemize hoş geldin.",
        "phase": "introduction",
        "topic": null,
        "timestampMs": 0
      },
      {
        "sequence": 2,
        "speaker": "ai",
        "content": "React'te useEffect hook'unu kullanırken dependency array'in önemini anlatır mısın?",
        "phase": "technical",
        "topic": "React",
        "timestampMs": 45000
      },
      {
        "sequence": 3,
        "speaker": "candidate",
        "content": "Tabii, useEffect'te dependency array aslında React'e...",
        "phase": "technical",
        "topic": "React",
        "timestampMs": 47500
      }
    ]
  }
}
```

**Errors:**
- `404` - Session not found
- `400` - Session not completed yet

---

### 3.2.4 `GET /health` - Health Check

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2026-01-23T10:00:00Z",
  "services": {
    "database": "ok",
    "websocket": "ok"
  }
}
```

---

### 3.2.5 `POST /demo-session` - Demo Session Oluştur

Access code ile demo görüşme oluşturur. Sabit demo verilerle session yaratır.

**Request:**
```json
{
  "code": "DEMO123"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "joinUrl": "https://interview.example.com/interview/550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "createdAt": "2026-01-23T10:00:00Z"
  }
}
```

**Errors:**
- `400` - Code eksik veya geçersiz format
- `401` - Geçersiz access code

---

### 3.2.6 `POST /transcribe` - Audio Transcription (Whisper)

Frontend'den gelen ses dosyasını OpenAI Whisper API ile transkribe eder.

**Request:** `multipart/form-data`

| Field | Type | Açıklama |
|-------|------|----------|
| `audio` | File | Ses dosyası (max 25MB, webm/wav/mp3) |
| `language` | String | Dil kodu (varsayılan: `tr`) |
| `prompt` | String | Bağlam prompt'u (opsiyonel) |

**Response (200 OK):**
```json
{
  "success": true,
  "text": "Transkribe edilmiş metin...",
  "metric": {
    "service": "whisper",
    "operation": "speech_to_text",
    "durationMs": 1200,
    "inputSize": 45000,
    "outputSize": 150,
    "model": "whisper-1",
    "audioLengthMs": 5000
  }
}
```

**Errors:**
- `400` - Ses dosyası eksik
- `500` - Transcription hatası

---

### 3.2.7 `POST /mock-ats/callback` - Mock ATS Callback

Test amaçlı mock ATS callback endpoint'i. Gelen transcript verilerini loglar.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Transcript received"
}
```

---

## 3.3 WebSocket API

### 3.3.1 Bağlantı

```
wss://api.interview.example.com/ws?sessionId={sessionId}
```

Bağlantı kurulduğunda server otomatik olarak `connection:ready` event'i gönderir.

---

### 3.3.2 Message Format

Tüm mesajlar JSON formatında:

```json
{
  "event": "event_name",
  "data": { ... }
}
```

**Audio chunk'ları için:** Binary WebSocket frame (JSON değil)

---

### 3.3.3 Client → Server Events

#### `interview:start`
Görüşmeyi başlatır.

```json
{
  "event": "interview:start",
  "data": {}
}
```

---

#### `interview:end`
Görüşmeyi sonlandırır.

```json
{
  "event": "interview:end",
  "data": {
    "reason": "completed"
  }
}
```

Reason değerleri: `completed`, `candidate_left`, `technical_error`

---

#### `interview:resume`
Reconnect sonrası görüşmeyi devam ettirir. Frontend, WS bağlantısı + Simli avatar hazır olduktan sonra gönderir.

```json
{
  "event": "interview:resume",
  "data": {}
}
```

---

#### `candidate:speaking:start`
Aday konuşmaya başladığında gönderilir.

```json
{
  "event": "candidate:speaking:start",
  "data": {}
}
```

---

#### `candidate:speaking:end`
Aday konuşmayı bitirdiğinde gönderilir (VAD veya manuel).

```json
{
  "event": "candidate:speaking:end",
  "data": {}
}
```

---

#### `candidate:interrupt`
Aday, AI konuşurken kesmek istediğinde.

```json
{
  "event": "candidate:interrupt",
  "data": {}
}
```

---

#### `transcript:update`
Frontend'den gelen transcript'i backend'e iletir. Whisper API ile elde edilen transcript backend'e gönderilir.

```json
{
  "event": "transcript:update",
  "data": {
    "text": "Tabii, useEffect'te dependency array aslında...",
    "isFinal": false
  }
}
```

**Not:** `isFinal: true` geldiğinde backend transcript'i DB'ye kaydeder ve Claude'a gönderir.

---

### 3.3.4 Server → Client Events

#### `connection:ready`
Bağlantı kurulduğunda, session state ile birlikte gönderilir.

```json
{
  "event": "connection:ready",
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "currentPhase": "introduction",
    "currentQuestionIndex": 0,
    "candidate": {
      "name": "Ahmet Yılmaz"
    },
    "position": {
      "title": "Senior Frontend Developer",
      "company": "TechCorp"
    },
    "config": {
      "phases": ["introduction", "experience", "technical", "behavioral", "motivation", "closing"]
    }
  }
}
```

---

#### `connection:error`
Bağlantı hatası.

```json
{
  "event": "connection:error",
  "data": {
    "code": "SESSION_NOT_FOUND",
    "message": "Görüşme bulunamadı"
  }
}
```

---

#### `ai:speaking:start`
AI konuşmaya başlıyor. Text içerir (UI'da gösterilebilir).

```json
{
  "event": "ai:speaking:start",
  "data": {
    "text": "Merhaba Ahmet, TechCorp Senior Frontend Developer pozisyonu için görüşmemize hoş geldin.",
    "phase": "introduction",
    "topic": null,
    "reasoning": "İlk mesaj, tanışma fazı.",
    "turn": "candidate"
  }
}
```

**Turn Field:**
- `"candidate"`: Soru soruldu, aday cevap verecek. Frontend mikrofonu açar.
- `"ai"`: AI kısa yorum/geçiş cümlesi söyledi, devam edecek. Mikrofon KAPALI kalır.

---

#### `ai:speaking:end`
AI konuşmayı bitirdi.

```json
{
  "event": "ai:speaking:end",
  "data": {}
}
```

---

#### `audio:chunk`
TTS audio chunk'ı. **Binary WebSocket frame** olarak gönderilir.

Format: Raw PCM veya MP3 (ElevenLabs output formatına göre)

---

#### `phase:changed`
Görüşme fazı değişti.

```json
{
  "event": "phase:changed",
  "data": {
    "from": "introduction",
    "to": "experience",
    "questionIndex": 0
  }
}
```

---

#### `question:new`
Yeni soru başladı (UI feedback için).

```json
{
  "event": "question:new",
  "data": {
    "phase": "technical",
    "topic": "React",
    "questionIndex": 3
  }
}
```

---

#### `interview:ended`
Görüşme tamamlandı.

```json
{
  "event": "interview:ended",
  "data": {
    "reason": "completed",
    "duration": {
      "totalMinutes": 40
    }
  }
}
```

---

#### `error`
Hata oluştu.

```json
{
  "event": "error",
  "data": {
    "code": "TTS_ERROR",
    "message": "Ses üretme hatası oluştu",
    "recoverable": true
  }
}
```

---

## 3.4 ATS Callback

Görüşme tamamlandığında, Interview API otomatik olarak ATS'e transcript gönderir.

### Configuration

```env
ATS_CALLBACK_URL=https://ats.example.com/api/interviews/callback
ATS_API_KEY=your-api-key-here
```

### Request

**POST** `{ATS_CALLBACK_URL}`

**Headers:**
```
Content-Type: application/json
X-API-Key: {ATS_API_KEY}
```

**Body:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "candidate": {
    "name": "Ahmet Yılmaz"
  },
  "position": {
    "title": "Senior Frontend Developer",
    "company": "TechCorp"
  },
  "duration": {
    "startedAt": "2026-01-23T10:05:00Z",
    "endedAt": "2026-01-23T10:45:00Z",
    "totalMinutes": 40
  },
  "transcript": [
    {
      "sequence": 1,
      "speaker": "ai",
      "content": "Merhaba Ahmet...",
      "phase": "introduction",
      "topic": null,
      "timestampMs": 0
    },
    {
      "sequence": 2,
      "speaker": "candidate",
      "content": "Merhaba, teşekkürler...",
      "phase": "introduction",
      "topic": null,
      "timestampMs": 3500
    }
  ],
  "phaseSummary": {
    "introduction": { "questionCount": 2, "durationMs": 60000 },
    "experience": { "questionCount": 3, "durationMs": 300000 },
    "technical": { "questionCount": 8, "durationMs": 900000 },
    "behavioral": { "questionCount": 4, "durationMs": 480000 },
    "motivation": { "questionCount": 2, "durationMs": 180000 },
    "closing": { "questionCount": 1, "durationMs": 60000 }
  }
}
```

### Expected Response

**200 OK:**
```json
{
  "success": true,
  "message": "Transcript received"
}
```

**Not:** Retry mekanizması yok. ATS response'u `session_events` tablosuna loglanır.

---

## 3.5 Error Codes

### REST API Errors

| Code | HTTP | Açıklama |
|------|------|----------|
| `VALIDATION_ERROR` | 400 | Request body validation hatası |
| `UNAUTHORIZED` | 401 | Eksik veya geçersiz API key |
| `SESSION_NOT_FOUND` | 404 | Session bulunamadı |
| `SESSION_NOT_COMPLETED` | 400 | Session henüz tamamlanmadı |
| `SESSION_ALREADY_STARTED` | 400 | Session zaten başlamış |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit aşıldı |
| `INTERNAL_ERROR` | 500 | Sunucu hatası |

### WebSocket Error Codes

| Code | Açıklama | Recoverable |
|------|----------|-------------|
| `SESSION_NOT_FOUND` | Session bulunamadı | No |
| `SESSION_COMPLETED` | Session zaten tamamlanmış | No |
| `RATE_LIMIT_EXCEEDED` | Bağlantı veya mesaj rate limit aşıldı | Yes |
| `INVALID_MESSAGE` | Geçersiz mesaj formatı | Yes |
| `STT_ERROR` | Ses tanıma hatası | Yes |
| `TTS_ERROR` | Ses üretme hatası | Yes |
| `LLM_ERROR` | AI yanıt hatası | Yes |
| `AVATAR_ERROR` | Avatar hatası | Yes |
| 4010 | Session taken over by another client | - |

---

## 3.6 Akış Diyagramları

### 3.6.1 Session Oluşturma

```
ATS                         Interview API                    PostgreSQL
 │                               │                               │
 │  POST /sessions               │                               │
 │  {position, candidate,        │                               │
 │   interview_topics}           │                               │
 │──────────────────────────────►│                               │
 │                               │                               │
 │                               │  Validate request             │
 │                               │                               │
 │                               │  INSERT session               │
 │                               │  INSERT interview_config      │
 │                               │──────────────────────────────►│
 │                               │                               │
 │                               │  session_id                   │
 │                               │◄──────────────────────────────│
 │                               │                               │
 │  201 Created                  │                               │
 │  {sessionId, joinUrl}         │                               │
 │◄──────────────────────────────│                               │
```

### 3.6.2 WebSocket Görüşme Akışı

```
Frontend                    Backend WS                   Services
   │                            │                            │
   │  Connect + sessionId       │                            │
   │───────────────────────────►│                            │
   │                            │  Load session from DB      │
   │                            │                            │
   │  connection:ready          │                            │
   │  (session state + config)  │                            │
   │◄───────────────────────────│                            │
   │                            │                            │
   │  interview:start           │                            │
   │───────────────────────────►│                            │
   │                            │  Update session status     │
   │                            │  Generate question         │
   │                            │───────────────────────────►│ Claude
   │                            │  question text             │
   │                            │◄───────────────────────────│
   │                            │                            │
   │                            │  TTS request               │
   │                            │───────────────────────────►│ ElevenLabs
   │                            │                            │
   │  ai:speaking:start         │                            │
   │  (question text)           │                            │
   │◄───────────────────────────│                            │
   │                            │  audio chunks              │
   │  audio:chunk (binary)      │◄───────────────────────────│
   │◄───────────────────────────│                            │
   │  ... more chunks ...       │                            │
   │                            │                            │
   │  ai:speaking:end           │                            │
   │◄───────────────────────────│                            │
   │                            │                            │
   │  candidate:speaking:start  │                            │
   │───────────────────────────►│                            │
   │                            │                            │
   │  [Aday audio'yu backend'e   │                            │
   │   gönderiyor, Whisper STT] │                            │
   │                            │                            │
   │  transcript:update         │                            │
   │  (isFinal: false)          │                            │
   │───────────────────────────►│  (partial - log only)      │
   │                            │                            │
   │  transcript:update         │                            │
   │  (isFinal: true)           │                            │
   │───────────────────────────►│  Save to DB                │
   │                            │  Send to Claude            │
   │                            │───────────────────────────►│ Claude
   │                            │                            │
   │  candidate:speaking:end    │                            │
   │───────────────────────────►│                            │
   │                            │                            │
   │         [DÖNGÜ DEVAM EDER]                              │
```

---

## 3.7 Kesinleşen Kararlar

| Karar | Değer | Gerekçe |
|-------|-------|---------|
| ATS Callback URL | Environment variable | Basit, tek ATS entegrasyonu |
| ATS Auth | Header'da API key | Basit, yeterli güvenlik |
| Audio format | Binary frame | Daha verimli, düşük overhead |
| Session config | WebSocket ile | Ayrı endpoint gerektirmez |
| Transcript relay | Frontend → Backend WS | DB kaydı ve Claude context için |

---

## 3.8 Environment Variables

```env
# Server
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/interview

# ATS Integration
ATS_CALLBACK_URL=https://ats.example.com/api/interviews/callback
ATS_API_KEY=your-ats-api-key

# External Services
ANTHROPIC_API_KEY=your-anthropic-key
ELEVENLABS_API_KEY=your-elevenlabs-key
OPENAI_API_KEY=your-openai-key
SIMLI_API_KEY=your-simli-key

# Frontend (public)
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
```

---

**Önceki Bölüm:** [02-database-design.md](./02-database-design.md)  
**Sonraki Bölüm:** [04-project-structure.md](./04-project-structure.md)
