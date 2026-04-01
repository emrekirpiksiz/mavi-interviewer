# Feature: Security Hardening - Rate Limiting & API Key Auth

> **Oncelik:** Yuksek  
> **Tahmini Effort:** S-M  
> **Bagimliliklar:** Yok (mevcut altyapi uzerinde calisir)  
> **Tarih:** 2026-02-07

---

## Problem / Motivasyon

Projede iki kritik guvenlik acigi tespit edildi:

### 1. Rate Limiting Yok

`docs/plans/08-security-auth.md` dokumaninda rate limiting planlanmis ancak **hicbir sekilde implement edilmemis**:

- `express-rate-limit` paketi yuklu degil
- Hicbir REST endpoint'te rate limiting yok
- WebSocket baglanti ve mesajlarinda rate limiting yok
- `POST /demo-session` endpoint'i access code ile korunuyor ama rate limit olmadigi icin brute-force ile code tahmin edilebilir
- `POST /transcribe` pahali bir islem (Whisper API maliyeti) ve tamamen acik

### 2. Session Olusturma Auth Yok

`POST /sessions` endpoint'i **tamamen korumasiz** - herhangi biri bu endpoint'i biliyorsa sinirsiz session olusturabilir:

- `ATS_API_KEY` config'de tanimli ama hicbir yerde authentication icin kullanilmiyor
- Dokumantasyonda (`08-security-auth.md`, bolum 8.3) API key auth planlanmis ama implement edilmemis
- Session olusturma akisi: MatchMind backend -> Interview API (server-to-server)
- Kullaniciya sadece `joinUrl` linki veriliyor

---

## Mevcut Durum (Kod Analizi)

### Rate Limiting

| Dosya | Durum |
|-------|-------|
| `apps/api/src/middleware/rateLimiter.ts` | MEVCUT DEGIL |
| `apps/api/src/app.ts` | Rate limiter middleware yok |
| `apps/api/src/routes/sessions.ts` | Rate limit yok |
| `apps/api/src/routes/demo-session.ts` | Rate limit yok |
| `apps/api/src/routes/transcribe.ts` | Rate limit yok |
| `apps/api/src/websocket/index.ts` | Baglanti rate limit yok |
| `apps/api/src/websocket/handlers.ts` | Mesaj rate limit yok |

### Authentication

| Dosya | Durum |
|-------|-------|
| `apps/api/src/middleware/apiKeyAuth.ts` | MEVCUT DEGIL |
| `apps/api/src/routes/sessions.ts` | Auth middleware yok, `POST /` tamamen acik |
| `apps/api/src/config/index.ts` | `atsApiKey` tanimli ama auth icin kullanilmiyor |

---

## Cozum Yaklasimi

### Bolum 1: Katmanli Rate Limiting

`express-rate-limit` paketi ile in-memory rate limiting. Redis gerekmez (tek instance deployment).

#### Rate Limit Tablosu

| Endpoint | Limit | Pencere | Bazinda | Gerekce |
|----------|-------|---------|---------|---------|
| Global (tum REST) | 100 req | 1 dk | IP | Genel koruma |
| `POST /sessions` | 10 req | 1 dk | IP | ATS server-to-server, dusuk hacim |
| `POST /demo-session` | 5 req | 1 dk | IP | Access code brute-force engeli |
| `POST /transcribe` | 30 req | 1 dk | IP | Pahali islem ama realtime ihtiyac |
| WebSocket baglanti | 10 baglanti | 1 dk | IP | Baglanti flood engeli |
| WebSocket mesaj | 60 mesaj | 1 dk | Session | Mesaj flood engeli |

#### Teknik Tasarim

```typescript
// apps/api/src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';

const baseConfig = {
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' }
  }
};

export const globalLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 1000,
  max: 100,
});

export const createSessionLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 1000,
  max: 10,
});

export const demoSessionLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 1000,
  max: 5,
});

export const transcribeLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 1000,
  max: 30,
});
```

WebSocket rate limiting icin ayri bir in-memory Map yapisi:

```typescript
// WebSocket baglanti rate limiting (IP bazli)
const connectionAttempts = new Map<string, { count: number; resetAt: number }>();
const WS_CONNECTION_LIMIT = 10; // per minute per IP

// WebSocket mesaj rate limiting (session bazli)
const messageCounters = new Map<string, { count: number; resetAt: number }>();
const WS_MESSAGE_LIMIT = 60; // per minute per session
```

### Bolum 2: API Key Authentication

MatchMind backend -> Interview API iletisimi server-to-server. `X-API-Key` header'i ile basit ve etkili dogrulama.

#### Akis

```
MatchMind Backend                          Interview API
     |                                          |
     |  POST /sessions                          |
     |  Headers:                                |
     |    Content-Type: application/json        |
     |    X-API-Key: {shared_secret}            |
     |  Body: {request_body}                    |
     |----------------------------------------->|
     |                                          |
     |                    1. X-API-Key header var mi?
     |                    2. Deger ATS_API_KEY ile eslesir mi?
     |                                          |
     |  201 Created / 401 Unauthorized          |
     |<-----------------------------------------|
```

#### Teknik Tasarim

```typescript
// apps/api/src/middleware/apiKeyAuth.ts
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

/**
 * ATS/MatchMind istekleri icin API key dogrulama middleware'i.
 * X-API-Key header'ini config.atsApiKey ile karsilastirir.
 */
export function validateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing API key'
      }
    });
  }

  if (apiKey !== config.atsApiKey) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key'
      }
    });
  }

  next();
}
```

#### MatchMind Tarafinda Degisiklik

Mevcut MatchMind kodu:

```typescript
// ONCESI
headers['Authorization'] = `Bearer ${EXTERNAL_INTERVIEW_API_KEY}`

// SONRASI
headers['X-API-Key'] = EXTERNAL_INTERVIEW_API_KEY
```

Tek degisiklik: `Authorization: Bearer` header'i yerine `X-API-Key` header'i kullanilir. Ayni key, farkli header.

---

## Etkilenen Dosyalar

### Yeni Dosyalar

| Dosya | Icerik |
|-------|--------|
| `apps/api/src/middleware/rateLimiter.ts` | Tum rate limiter tanimlari |
| `apps/api/src/middleware/apiKeyAuth.ts` | API key dogrulama middleware |

### Degisecek Dosyalar

| Dosya | Degisiklik |
|-------|------------|
| `apps/api/package.json` | `express-rate-limit` bagimliligi eklenir |
| `apps/api/src/app.ts` | Global rate limiter ve JSON body size limit eklenir |
| `apps/api/src/routes/sessions.ts` | `validateApiKey` + `createSessionLimiter` middleware eklenir |
| `apps/api/src/routes/demo-session.ts` | `demoSessionLimiter` middleware eklenir |
| `apps/api/src/routes/transcribe.ts` | `transcribeLimiter` middleware eklenir |
| `apps/api/src/websocket/index.ts` | IP bazli baglanti rate limiting eklenir |
| `apps/api/src/websocket/handlers.ts` | Session bazli mesaj rate limiting eklenir (veya ayri utility) |

### Dokumantasyon Guncellemeleri

| Dosya | Degisiklik |
|-------|------------|
| `docs/plans/08-security-auth.md` | Rate limiting ve auth bolumleri guncellenir |
| `docs/plans/03-api-design.md` | `POST /sessions` auth header'lari eklenir |
| `docs/plans/04-project-structure.md` | Yeni middleware dosyalari eklenir |
| `docs/guides/create-session-guide.md` | API key auth ornekleri eklenir |
| `docs/features/backlog.md` | #4 ve #5 maddeler "Tamamlanan" bolumune tasinir |

---

## Kabul Kriterleri

### Rate Limiting

- [x] `express-rate-limit` paketi yuklu ve calisiyor
- [x] Global rate limiter tum REST endpoint'lere uygulanmis (100 req/dk per IP)
- [x] `POST /sessions` endpoint'i 10 req/dk per IP ile sinirli
- [x] `POST /demo-session` endpoint'i 5 req/dk per IP ile sinirli
- [x] `POST /transcribe` endpoint'i 30 req/dk per IP ile sinirli
- [x] WebSocket baglantilari 10 baglanti/dk per IP ile sinirli
- [x] WebSocket mesajlari 60 mesaj/dk per session ile sinirli
- [x] Rate limit asildiginda uygun hata mesaji doner (`429 Too Many Requests`)
- [x] Rate limit header'lari response'a eklenir (`RateLimit-*`)

### API Key Auth

- [x] `POST /sessions` endpoint'i `X-API-Key` header'i gerektiriyor
- [x] Gecersiz API key 401 doner
- [x] Eksik API key header'i 401 doner
- [x] Mevcut `ATS_API_KEY` env variable kullaniliyor (yeni env gerekmez)
- [x] Diger endpoint'ler (`GET /sessions/:id`, `POST /demo-session`) etkilenmez

### Genel

- [x] Mevcut testler kirilmadi
- [x] TypeScript hatalari yok
- [x] Lint hatalari yok
- [x] Ilgili dokumantasyon guncellendi

---

## Notlar

### Kapsam Disi (yapilmayacak)

- **HMAC-SHA256 signing**: Gelecekte gerekirse ayri feature olarak eklenebilir.
- **Redis-based rate limiting**: Tek instance deployment icin gereksiz.
- **IP whitelisting**: ATS IP adresleri degisebilir, esnek degil.
- **JWT/OAuth**: Server-to-server icin overkill.
- **Helmet/security headers**: Ayri bir feature olarak planlanabilir.
- **GET /sessions/:id auth**: Session UUID bilgisi (122-bit entropy) yeterli erisim kontrolu saglar.

### MatchMind Koordinasyonu

API key implementasyonu sonrasi MatchMind tarafinda tek degisiklik:
- `Authorization: Bearer {key}` -> `X-API-Key: {key}` header degisikligi
- Ayni key kullanilmaya devam eder, ekstra konfigrasyon gerekmez

### Trade-off'lar

| Karar | Secim | Gerekce |
|-------|-------|---------|
| Rate limit store | In-memory | Tek instance, Redis gereksiz |
| Auth mekanizmasi | API Key | Basit, etkili, server-to-server icin yeterli |
| Auth header | `X-API-Key` | Standart, dokumantasyonla uyumlu (08-security-auth.md) |

---

*Son guncelleme: 2026-02-07*
