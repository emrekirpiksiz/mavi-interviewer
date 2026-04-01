# BÖLÜM 4: PROJE YAPISI

> **Versiyon:** 1.1  
> **Son Güncelleme:** 2026-02-07  
> **Durum:** ✅ Onaylandı

---

## 4.1 Genel Bakış

pnpm workspace kullanarak monorepo yapısı. İki ana uygulama ve bir shared package.

### Yapı Prensipleri
- **Basitlik:** Minimum klasör derinliği, açık isimlendirme
- **Ayrışım:** Frontend ve backend tamamen ayrı
- **Shared:** Sadece types ve constants paylaşılır
- **Migration:** Raw SQL dosyaları (vendor-agnostic)
- **Test:** Happy path testleri için hazır yapı

---

## 4.2 Klasör Yapısı

```
ai-interview/
├── package.json                 # Root package.json (workspaces)
├── pnpm-workspace.yaml          # pnpm workspace config
├── .env.example                 # Environment variables template
├── .gitignore
├── README.md
│
├── apps/
│   ├── web/                     # -------- NEXT.JS FRONTEND --------
│   │   ├── package.json
│   │   ├── next.config.js
│   │   ├── tailwind.config.js
│   │   ├── tsconfig.json
│   │   ├── .env.local.example
│   │   ├── public/
│   │   │   └── images/
│   │   ├── src/
│   │   │   ├── app/                      # App Router
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx              # Landing/Home
│   │   │   │   ├── globals.css
│   │   │   │   ├── interview/
│   │   │   │   │   └── [sessionId]/
│   │   │   │   │       └── page.tsx      # Görüşme sayfası
│   │   │   ├── components/
│   │   │   │   ├── ui/                   # shadcn/ui components
│   │   │   │   │   └── button.tsx
│   │   │   │   ├── interview/
│   │   │   │   │   ├── ActiveScreen.tsx  # Aktif görüşme ekranı
│   │   │   │   │   ├── Avatar.tsx        # Simli avatar wrapper
│   │   │   │   │   ├── CompletedScreen.tsx # Tamamlanmış ekran
│   │   │   │   │   ├── ConnectionIndicator.tsx # Bağlantı göstergesi
│   │   │   │   │   ├── ConnectionStatus.tsx # Bağlantı durumu
│   │   │   │   │   ├── ControlBar.tsx    # Mic, end call buttons
│   │   │   │   │   ├── ErrorScreen.tsx   # Hata ekranı
│   │   │   │   │   ├── index.ts          # Re-exports
│   │   │   │   │   ├── LoadingScreen.tsx # Yükleme ekranı
│   │   │   │   │   ├── NetworkMetricsPanel.tsx # Ağ metrikleri
│   │   │   │   │   ├── PhaseIndicator.tsx
│   │   │   │   │   ├── ReadyScreen.tsx   # Hazır ekranı
│   │   │   │   │   ├── SetupScreen.tsx   # Kurulum ekranı
│   │   │   │   │   ├── Timer.tsx         # Süre sayacı
│   │   │   │   │   ├── TranscriptEntry.tsx # Tekil transcript
│   │   │   │   │   ├── ReconnectingScreen.tsx # Yeniden bağlanma ekranı
│   │   │   │   │   ├── TakenOverScreen.tsx   # Session takeover ekranı
│   │   │   │   │   ├── TurnOverlay.tsx      # Sıra değişim overlay
│   │   │   │   │   ├── UnsupportedBrowserScreen.tsx # Desteklenmeyen tarayıcı/cihaz ekranı
│   │   │   │   │   └── TranscriptPanel.tsx
│   │   │   │   └── common/
│   │   │   │       ├── index.ts
│   │   │   │       └── Spinner.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useWebSocket.ts       # WS connection hook
│   │   │   │   ├── useWhisper.ts         # Whisper STT hook
│   │   │   │   ├── useAudioPlayer.ts     # TTS audio playback
│   │   │   │   ├── useSpeechRecognition.ts # Web Speech API fallback
│   │   │   │   ├── useNetworkCheck.ts    # Network health check
│   │   │   │   ├── useSimli.ts           # Simli avatar hook
│   │   │   │   └── useInterview.ts       # Interview orchestration
│   │   │   ├── stores/
│   │   │   │   └── interviewStore.ts     # Zustand store
│   │   │   ├── lib/
│   │   │   │   ├── browserCheck.ts       # Tarayıcı/cihaz tespit utility
│   │   │   │   ├── sessionLogger.ts      # Session logging utility
│   │   │   │   └── utils.ts
│   │   └── __tests__/                    # Frontend tests
│   │       ├── components/
│   │       │   └── Avatar.test.tsx
│   │       └── hooks/
│   │           └── useWebSocket.test.ts
│   │
│   └── api/                     # -------- EXPRESS.JS BACKEND --------
│       ├── package.json
│       ├── tsconfig.json
│       ├── .env.example
│       ├── src/
│       │   ├── index.ts                  # Entry point
│       │   ├── app.ts                    # Express app setup
│       │   ├── routes/
│       │   │   ├── index.ts              # Route aggregator
│       │   │   ├── sessions.ts           # /sessions routes
│       │   │   ├── health.ts             # /health route
│       │   │   ├── demo-session.ts       # Demo session endpoint
│       │   │   ├── mock-ats.ts           # Mock ATS callback
│       │   │   └── transcribe.ts         # Whisper STT endpoint
│       │   ├── websocket/
│       │   │   ├── index.ts              # WS server setup
│       │   │   ├── handlers.ts           # Event handlers
│       │   │   └── connectionManager.ts  # Connection tracking
│       │   ├── services/
│       │   │   ├── sessionService.ts     # Session CRUD
│       │   │   ├── interviewEngine.ts    # Claude integration
│       │   │   ├── promptBuilder.ts      # Prompt template builder
│       │   │   ├── stateMachine.ts       # Interview state machine
│       │   │   ├── ttsService.ts         # ElevenLabs integration
│       │   │   ├── matchmindService.ts   # MatchMind ATS callback
│       │   │   └── audioRecordingService.ts # Audio recording, ffmpeg encode, Azure upload
│       │   ├── db/
│       │   │   ├── index.ts              # DB connection (pg)
│       │   │   └── queries/
│       │   │       ├── index.ts
│       │   │       ├── sessions.ts
│       │   │       ├── configs.ts
│       │   │       ├── transcripts.ts
│       │   │       └── webhookLogs.ts
│       │   ├── middleware/
│       │   │   ├── validation.ts
│       │   │   ├── rateLimiter.ts         # Rate limiter tanımları
│       │   │   └── apiKeyAuth.ts          # API key doğrulama
│       │   ├── config/
│       │   │   └── index.ts              # Environment config
│       ├── migrations/                   # SQL migration files
│       │   ├── 001_create_enums.sql
│       │   ├── 002_create_sessions.sql
│       │   ├── 003_create_interview_configs.sql
│       │   ├── 004_create_transcript_entries.sql
│       │   ├── 005_create_session_events.sql
│       │   ├── 006_create_indexes.sql
│       │   ├── 007_add_conversation_history.sql
│       │   ├── 008_create_webhook_logs.sql
│       │   └── 009_add_recording_fields.sql
│       ├── scripts/
│       │   └── migrate.ts                # Migration runner
│       └── __tests__/                    # Backend tests
│           ├── routes/
│           │   └── sessions.test.ts
│           ├── services/
│           │   └── sessionService.test.ts
│           └── websocket/
│               └── handlers.test.ts
│
├── packages/                    # -------- SHARED PACKAGES --------
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                  # Re-export all
│           ├── types.ts                  # Shared TypeScript types
│           └── constants.ts              # Shared constants
│
└── docs/                        # -------- DOCUMENTATION --------
    ├── README.md
    ├── WORKFLOW.md
    ├── RAILWAY-DEPLOYMENT.md
    ├── plans/
    │   ├── 01-system-architecture.md
    │   ├── 02-database-design.md
    │   ├── 03-api-design.md
    │   ├── 04-project-structure.md
    │   └── ...
    ├── guides/
    │   ├── create-session-guide.md
    │   └── matchmind-api-guide.md
    ├── features/                # Gelecek özellik planları
    └── samples/
        └── ATS-Request-Sample.json
```

---

## 4.3 Klasör Detayları

### 4.3.1 `apps/web` - Next.js Frontend

| Klasör/Dosya | Amaç |
|--------------|------|
| `src/app/` | Next.js 14 App Router sayfaları |
| `src/app/interview/[sessionId]/` | Dinamik görüşme sayfası |
| `src/components/ui/` | shadcn/ui temel componentler |
| `src/components/interview/` | Görüşme ekranına özel componentler |
| `src/components/common/` | Genel kullanım componentler |
| `src/hooks/` | Custom React hooks (WS, Whisper, Audio, Simli) |
| `src/stores/` | Zustand state yönetimi |
| `src/lib/` | Utility fonksiyonlar, session logger |
| `__tests__/` | Jest + React Testing Library testleri |

### 4.3.2 `apps/api` - Express.js Backend

| Klasör/Dosya | Amaç |
|--------------|------|
| `src/index.ts` | Server entry point |
| `src/app.ts` | Express app configuration |
| `src/routes/` | REST API route handlers |
| `src/websocket/` | WebSocket server ve event handlers |
| `src/services/` | Business logic (Claude, ElevenLabs, MatchMind) |
| `src/db/` | Database connection ve query functions |
| `src/middleware/` | Express middleware |
| `src/config/` | Environment configuration |
| `migrations/` | Raw SQL migration dosyaları |
| `scripts/` | Utility scripts (migration runner) |
| `__tests__/` | Jest testleri |

### 4.3.3 `packages/shared` - Ortak Kod

| Dosya | İçerik |
|-------|--------|
| `types.ts` | Session, Transcript, Config, Event tipleri |
| `constants.ts` | Phase names, status enums, error codes |

---

## 4.4 Önemli Dosyalar

### Root `package.json`

```json
{
  "name": "ai-interview",
  "private": true,
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "dev:web": "pnpm --filter web dev",
    "dev:api": "pnpm --filter api dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "test:web": "pnpm --filter web test",
    "test:api": "pnpm --filter api test",
    "db:migrate": "pnpm --filter api db:migrate",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### `.env.example`

```env
# ============================================
# AI INTERVIEW - ENVIRONMENT VARIABLES
# ============================================

# Database (NeonDB veya On-prem PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/interview_db

# Server
PORT=3001
NODE_ENV=development

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000

# ATS Integration
ATS_CALLBACK_URL=https://ats.example.com/api/interviews/callback
ATS_API_KEY=your-ats-api-key

# AI Services
ANTHROPIC_API_KEY=your-anthropic-key
ELEVENLABS_API_KEY=your-elevenlabs-key
OPENAI_API_KEY=your-openai-key
SIMLI_API_KEY=your-simli-key

# Frontend (Public - exposed to browser)
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
```

---

## 4.5 Migration Stratejisi

Raw SQL dosyaları + basit TypeScript runner kullanılacak. Bu yaklaşım:
- NeonDB ile tam uyumlu
- On-prem PostgreSQL'e kolayca taşınabilir
- ORM bağımlılığı yok
- Tam kontrol

### Migration Dosya Formatı

```
migrations/
├── 001_create_enums.sql
├── 002_create_sessions.sql
├── 003_create_interview_configs.sql
├── 004_create_transcript_entries.sql
├── 005_create_session_events.sql
├── 006_create_indexes.sql
├── 007_add_conversation_history.sql
└── 008_create_webhook_logs.sql
```

### Migration Runner (`scripts/migrate.ts`)

Basit bir script:
1. `migrations` klasöründeki SQL dosyalarını sırayla okur
2. `schema_migrations` tablosunda çalıştırılmış migration'ları takip eder
3. Yeni migration'ları sırayla çalıştırır

```
pnpm --filter api db:migrate
```

---

## 4.6 Test Stratejisi

### Frontend Tests (`apps/web/__tests__/`)

| Klasör | Test Türü |
|--------|-----------|
| `components/` | Component rendering, user interactions |
| `hooks/` | Hook behavior, state changes |

**Araçlar:** Jest + React Testing Library

### Backend Tests (`apps/api/__tests__/`)

| Klasör | Test Türü |
|--------|-----------|
| `routes/` | API endpoint tests (supertest) |
| `services/` | Service unit tests |
| `websocket/` | WebSocket handler tests |

**Araçlar:** Jest + Supertest

### Test Scope (MVP)

Happy path testleri:
- Session oluşturma
- Session getirme
- WebSocket bağlantısı
- Transcript kaydetme
- ATS callback

---

## 4.7 Package Dependencies

### `apps/web/package.json` (Key Dependencies)

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "zustand": "^4.0.0",
    "tailwindcss": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@testing-library/react": "^14.0.0",
    "jest": "^29.0.0"
  }
}
```

### `apps/api/package.json` (Key Dependencies)

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "ws": "^8.0.0",
    "pg": "^8.0.0",
    "@anthropic-ai/sdk": "latest",
    "elevenlabs": "latest",
    "cors": "^2.8.0",
    "dotenv": "^16.0.0",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "ts-node": "^10.0.0",
    "nodemon": "^3.0.0",
    "jest": "^29.0.0",
    "supertest": "^6.0.0",
    "@types/express": "^4.0.0",
    "@types/ws": "^8.0.0",
    "@types/pg": "^8.0.0"
  }
}
```

### `packages/shared/package.json`

```json
{
  "name": "@ai-interview/shared",
  "version": "1.0.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {}
}
```

---

## 4.8 Development Workflow

### İlk Kurulum

```bash
# 1. Repository clone
git clone <repo-url>
cd ai-interview

# 2. Dependencies install
pnpm install

# 3. Environment setup
cp .env.example .env
# Edit .env with your values

# 4. Database migration
pnpm db:migrate

# 5. Development servers
pnpm dev
```

### Günlük Development

```bash
# Her iki app'i paralel çalıştır
pnpm dev

# Sadece frontend
pnpm dev:web

# Sadece backend
pnpm dev:api

# Test çalıştır
pnpm test
```

---

## 4.9 Kesinleşen Kararlar

| Karar | Değer | Gerekçe |
|-------|-------|---------|
| Monorepo tool | pnpm workspaces | Basit, hızlı, native |
| Shared package | Minimal (types + constants) | Gereksiz complexity yok |
| Migration | Raw SQL + script | Vendor-agnostic, tam kontrol |
| Test framework | Jest | Hem frontend hem backend |
| Test scope | Happy path | MVP için yeterli |

---

## 4.10 Klasör Oluşturma Sırası

Implementation sırasında:

1. Root yapısı (package.json, pnpm-workspace.yaml)
2. `packages/shared` (types, constants)
3. `apps/api` (routes, db, services)
4. `apps/web` (pages, components, hooks)
5. Tests (her modül sonrası)

---

**Önceki Bölüm:** [03-api-design.md](./03-api-design.md)  
**Sonraki Bölüm:** [05-interview-engine.md](./05-interview-engine.md)
