# AI Interview

Yapay zeka destekli gerçek zamanlı sesli görüşme sistemi.

## Tech Stack

- **Frontend:** Next.js 15 (App Router), TailwindCSS, shadcn/ui, Zustand
- **Backend:** Node.js + Express.js, PostgreSQL
- **AI Services:** Claude Sonnet 4.5, OpenAI Whisper (STT), ElevenLabs Turbo (TTS), Simli (Avatar)
- **Realtime:** WebSocket (ws package)
- **Package Manager:** pnpm (monorepo)

## Proje Yapısı

```
ai-interview/
├── apps/
│   ├── api/          # Express.js backend
│   └── web/          # Next.js frontend
├── packages/
│   └── shared/       # Ortak types ve constants
└── docs/             # Dokümantasyon
```

## Kurulum

```bash
# 1. Dependencies install
pnpm install

# 2. Environment setup
cp .env.example .env
# .env dosyasını düzenle

# 3. Database migration (Task 1.4 sonrası)
pnpm db:migrate

# 4. Development servers
pnpm dev
```

## Scripts

| Script | Açıklama |
|--------|----------|
| `pnpm dev` | Tüm uygulamaları paralel çalıştır |
| `pnpm dev:web` | Sadece frontend |
| `pnpm dev:api` | Sadece backend |
| `pnpm build` | Production build |
| `pnpm test` | Testleri çalıştır |
| `pnpm db:migrate` | Database migration |

## Implementation Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Foundation | ✅ | Tamamlandı |
| Phase 2: Session | ✅ | Tamamlandı |
| Phase 3: WebSocket | ✅ | Tamamlandı |
| Phase 4: Interview Engine | ✅ | Tamamlandı |
| Phase 5: Audio Pipeline | ✅ | Tamamlandı |
| Phase 6: Avatar & UI | ✅ | Simli SDK v2.0.0 entegre |
| Phase 7: Polish & Test | ⏳ | - |

## Dokümantasyon

Detaylı planlar için `docs/plans/` klasörüne bakın.
