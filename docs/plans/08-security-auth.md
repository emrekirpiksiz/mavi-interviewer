# BÖLÜM 8: SECURITY & AUTH

> **Versiyon:** 1.1  
> **Son Güncelleme:** 2026-02-07  
> **Durum:** ✅ Onaylandı (Rate Limiting & API Key Auth implement edildi)

---

## 8.1 Genel Bakış

MVP'de kullanıcı authentication yok. Güvenlik session-based erişim ve API key'ler üzerine kurulu.

### Güvenlik Katmanları

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SECURITY MODEL                                       │
└─────────────────────────────────────────────────────────────────────────────┘

1. SESSION SECURITY
   └─► UUID v4 (tahmin edilemez)
   └─► Session validation
   └─► Single connection (yeni bağlantı eskiyi kapatır)

2. API KEY SECURITY
   └─► External services → Backend only
   └─► ATS ↔ Interview → Shared API key

3. BASIC PROTECTIONS
   └─► CORS
   └─► Rate limiting
   └─► Input validation

4. AUDIT LOGGING
   └─► Session events
   └─► Connection events
   └─► Errors
```

---

## 8.2 Session Security

### UUID v4 Session ID

```
Format: 550e8400-e29b-41d4-a716-446655440000
Bits of entropy: 122
Collision probability: Negligible
```

Session ID bilinmeden görüşmeye erişim mümkün değil.

### Session Validation Flow

```
Request: /interview/{sessionId}
              │
              ▼
        ┌───────────────────┐
        │ UUID format valid?│──No──► 400 Bad Request
        └─────────┬─────────┘
                  │ Yes
                  ▼
        ┌───────────────────┐
        │ Session exists?   │──No──► 404 Not Found
        └─────────┬─────────┘
                  │ Yes
                  ▼
        ┌───────────────────┐
        │ Status check      │
        └─────────┬─────────┘
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
   pending     active     completed
      │           │           │
      ▼           ▼           ▼
   Allow       Allow      "Görüşme
   access      access     sona erdi"
```

### Single Connection Policy

Aynı session'a yeni bağlantı geldiğinde:

```
Session: abc-123
     │
     ├── Connection A (existing) ──► Disconnect + "Başka cihazdan bağlantı"
     │
     └── Connection B (new) ──────► Active connection
```

```typescript
// connectionManager.ts

class ConnectionManager {
  private connections: Map<string, WebSocket> = new Map();

  addConnection(sessionId: string, ws: WebSocket) {
    // Mevcut bağlantı varsa kapat
    const existing = this.connections.get(sessionId);
    if (existing) {
      existing.send(JSON.stringify({
        event: 'connection:displaced',
        data: { message: 'Başka bir cihazdan bağlantı kuruldu' }
      }));
      existing.close();
    }
    
    this.connections.set(sessionId, ws);
  }
}
```

---

## 8.3 API Key Management

### Key Yapısı

| Key | Kullanım | Lokasyon |
|-----|----------|----------|
| `ATS_API_KEY` | ATS ↔ Interview haberleşmesi | Backend .env |
| `ANTHROPIC_API_KEY` | Claude API | Backend .env |
| `ELEVENLABS_API_KEY` | TTS API | Backend .env |
| `SIMLI_API_KEY` | Avatar API | Backend .env |
| `OPENAI_API_KEY` | Whisper STT API | Backend .env |

### ATS Communication

Tek API key ile bidirectional haberleşme:

```
ATS → Interview API
POST /sessions
Headers:
  Content-Type: application/json
  X-API-Key: {ATS_API_KEY}

Interview API → ATS
POST {ATS_CALLBACK_URL}
Headers:
  Content-Type: application/json
  X-API-Key: {ATS_API_KEY}
```

### API Key Validation ✅ Implement Edildi

```typescript
// middleware/apiKeyAuth.ts

export function validateApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing API key' },
    });
    return;
  }

  if (apiKey !== config.atsApiKey) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
    });
    return;
  }

  next();
}

// Kullanım (routes/sessions.ts):
router.post('/', createSessionLimiter, validateApiKey, validateBody(createSessionSchema), handler);
```

### OpenAI Key (Whisper STT)

OpenAI API key tamamen backend'de tutulur, frontend'e expose edilmez. Frontend ses verilerini `/transcribe` endpoint'ine gönderir, backend Whisper API'yi çağırır.

---

## 8.4 CORS Configuration

```typescript
// app.ts

import cors from 'cors';

const corsOptions = {
  origin: function(origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL,      // Production
      'http://localhost:3000',        // Development
    ];
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key']
};

app.use(cors(corsOptions));
```

---

## 8.5 Rate Limiting ✅ Implement Edildi

### REST API Limits

`express-rate-limit` paketi ile katmanlı rate limiting. In-memory store (tek instance deployment, Redis gerekmez).

| Endpoint | Limit | Pencere | Bazında | Gerekçe |
|----------|-------|---------|---------|---------|
| Global (tüm REST) | 100 req | 1 dk | IP | Genel koruma |
| `POST /sessions` | 10 req | 1 dk | IP | ATS server-to-server, düşük hacim |
| `POST /demo-session` | 5 req | 1 dk | IP | Access code brute-force engeli |
| `POST /transcribe` | 30 req | 1 dk | IP | Pahalı işlem ama realtime ihtiyaç |
| WebSocket bağlantı | 10 bağlantı | 1 dk | IP | Bağlantı flood engeli |
| WebSocket mesaj | 60 mesaj | 1 dk | Session | Mesaj flood engeli |

```typescript
// middleware/rateLimiter.ts

import rateLimit from 'express-rate-limit';

const baseConfig = {
  standardHeaders: true,   // RateLimit-* headers
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
  },
};

export const globalLimiter = rateLimit({ ...baseConfig, windowMs: 60 * 1000, max: 100 });
export const createSessionLimiter = rateLimit({ ...baseConfig, windowMs: 60 * 1000, max: 10 });
export const demoSessionLimiter = rateLimit({ ...baseConfig, windowMs: 60 * 1000, max: 5 });
export const transcribeLimiter = rateLimit({ ...baseConfig, windowMs: 60 * 1000, max: 30 });

// Kullanım:
// app.ts: app.use(globalLimiter)
// routes/sessions.ts: router.post('/', createSessionLimiter, validateApiKey, ...)
// routes/demo-session.ts: router.post('/', demoSessionLimiter, ...)
// routes/transcribe.ts: router.post('/', transcribeLimiter, ...)
```

### WebSocket Rate Limits

```typescript
// websocket/index.ts - IP bazlı bağlantı rate limiting
const connectionAttempts = new Map<string, { count: number; resetAt: number }>();
const WS_CONNECTION_LIMIT = 10; // per minute per IP

// websocket/handlers.ts - Session bazlı mesaj rate limiting
const messageCounters = new Map<string, { count: number; resetAt: number }>();
const WS_MESSAGE_LIMIT = 60; // per minute per session

// Periyodik temizlik (her 5 dakikada expired entry'leri temizle)
// Limit aşıldığında: bağlantı → ws.close(4029), mesaj → error event gönderilir
```

---

## 8.6 Input Validation

### Zod Schemas

```typescript
// validation/schemas.ts

import { z } from 'zod';

// Session create request (ATS'den)
export const createSessionSchema = z.object({
  position: z.object({
    company: z.object({
      name: z.string().min(1).max(200),
      industry: z.string().max(100).optional(),
      size: z.string().max(50).optional(),
      tech_stack: z.array(z.string().max(50)).max(20).optional()
    }),
    title: z.string().min(1).max(200),
    responsibilities: z.array(z.string().max(500)).max(20).optional(),
    requirements: z.array(z.string().max(500)).max(20).optional()
  }),
  candidate: z.object({
    name: z.string().min(1).max(200),
    experiences: z.array(z.object({
      title: z.string().max(200),
      company: z.string().max(200),
      duration: z.string().max(100).optional(),
      description: z.string().max(2000).optional()
    })).max(10).optional(),
    education: z.array(z.object({
      degree: z.string().max(200),
      school: z.string().max(200),
      duration: z.string().max(100).optional()
    })).max(5).optional(),
    skills: z.array(z.string().max(100)).max(30).optional()
  }),
  interview_topics: z.array(z.object({
    category: z.string().max(50),
    topic: z.string().max(100),
    description: z.string().max(500).optional(),
    scoring: z.object({
      scale: z.string().optional(),
      minimum_expected: z.number().optional(),
      importance: z.string().optional()
    }).optional(),
    evaluation_guide: z.string().max(1000).optional()
  })).min(1).max(20)
});

// WebSocket message
export const wsMessageSchema = z.object({
  event: z.enum([
    'interview:start',
    'interview:end',
    'candidate:speaking:start',
    'candidate:speaking:end',
    'candidate:interrupt',
    'transcript:update'
  ]),
  data: z.record(z.any()).optional()
});

// Transcript update
export const transcriptUpdateSchema = z.object({
  text: z.string().max(5000),
  isFinal: z.boolean()
});
```

### Validation Middleware

```typescript
// middleware/validation.ts

import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: result.error.flatten()
        }
      });
    }
    
    req.body = result.data;
    next();
  };
}

// Kullanım
app.post('/sessions', validate(createSessionSchema), ...);
```

---

## 8.7 Audit Logging

### Log Events

| Event | Bilgi | Öncelik |
|-------|-------|---------|
| `session.created` | sessionId, timestamp | INFO |
| `session.started` | sessionId, timestamp | INFO |
| `session.completed` | sessionId, duration, timestamp | INFO |
| `session.failed` | sessionId, error, timestamp | ERROR |
| `connection.established` | sessionId, timestamp | DEBUG |
| `connection.displaced` | sessionId, timestamp | WARN |
| `connection.lost` | sessionId, timestamp | WARN |
| `ats.callback.sent` | sessionId, success, timestamp | INFO |
| `ats.callback.failed` | sessionId, error, timestamp | ERROR |
| `error.service` | service, error, timestamp | ERROR |

### Audit Logger Service

```typescript
// services/auditLogger.ts

interface AuditLog {
  timestamp: Date;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  event: string;
  sessionId?: string;
  data?: Record<string, any>;
}

class AuditLogger {
  private logs: AuditLog[] = [];

  log(level: AuditLog['level'], event: string, sessionId?: string, data?: Record<string, any>) {
    const logEntry: AuditLog = {
      timestamp: new Date(),
      level,
      event,
      sessionId,
      data
    };

    // Console output
    console.log(JSON.stringify(logEntry));

    // Memory'de tut (son 1000 log)
    this.logs.push(logEntry);
    if (this.logs.length > 1000) {
      this.logs.shift();
    }

    // Aynı zamanda session_events tablosuna yaz (önemli eventler için)
    if (['INFO', 'WARN', 'ERROR'].includes(level) && sessionId) {
      this.persistToDatabase(logEntry);
    }
  }

  private async persistToDatabase(log: AuditLog) {
    // session_events tablosuna kaydet
    if (log.sessionId) {
      await db.query(`
        INSERT INTO session_events (session_id, event_type, event_data, created_at)
        VALUES ($1, $2, $3, $4)
      `, [log.sessionId, log.event, log.data, log.timestamp]);
    }
  }

  // Monitoring endpoint için
  getRecentLogs(count: number = 100): AuditLog[] {
    return this.logs.slice(-count);
  }
}

export const auditLogger = new AuditLogger();
```

### Kullanım Örnekleri

```typescript
// Session oluşturulduğunda
auditLogger.log('INFO', 'session.created', sessionId);

// Görüşme başladığında
auditLogger.log('INFO', 'session.started', sessionId);

// Bağlantı düşürüldüğünde
auditLogger.log('WARN', 'connection.displaced', sessionId, {
  reason: 'New connection from another device'
});

// Hata durumunda
auditLogger.log('ERROR', 'error.service', sessionId, {
  service: 'elevenlabs',
  error: error.message
});
```

---

## 8.8 Environment Variables

### Backend (.env)

```env
# Server
PORT=3001
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:pass@host:5432/interview_db

# ATS Integration
ATS_CALLBACK_URL=https://ats.example.com/api/interviews/callback
ATS_API_KEY=your-shared-api-key-here

# External Services (SECRET - never expose)
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...
SIMLI_API_KEY=...

# CORS
FRONTEND_URL=https://interview.example.com
```

### Frontend (.env.local)

```env
# API URLs
NEXT_PUBLIC_API_URL=https://api.interview.example.com
NEXT_PUBLIC_WS_URL=wss://api.interview.example.com/ws
```

---

## 8.9 Security Checklist

### MVP'de Yapılacaklar ✅

- [x] UUID v4 session ID
- [x] Session validation
- [x] Single connection policy
- [x] API key for ATS communication (✅ `X-API-Key` header ile `POST /sessions` koruması)
- [x] External API keys in backend only
- [x] CORS configuration
- [x] Rate limiting (✅ Global + endpoint-specific + WebSocket bağlantı + mesaj)
- [x] Input validation (Zod)
- [x] Audit logging
- [x] JSON body size limit (1MB)

### Gelecek İyileştirmeler

Güvenlik ile ilgili gelecek özellikler: [Feature Backlog](../features/backlog.md)

---

## 8.10 Kesinleşen Kararlar

| Karar | Değer | Gerekçe |
|-------|-------|---------|
| User auth | Yok (MVP) | Basitlik, session-based yeterli |
| ATS API key | Tek key (bidirectional) | Basit yönetim |
| Session access | Yeni bağlantı eskiyi kapatır | Tek cihaz politikası |
| Whisper (OpenAI) key | Backend'de | Güvenli, frontend'e expose edilmez |
| Logging | Audit log + DB persist | Monitoring için gerekli |
| Rate limiting | Katmanlı (global + endpoint + WS) | express-rate-limit + in-memory Map |

---

**Önceki Bölüm:** [07-frontend-architecture.md](./07-frontend-architecture.md)  
**Sonraki Bölüm:** [09-task-breakdown.md](./09-task-breakdown.md)
