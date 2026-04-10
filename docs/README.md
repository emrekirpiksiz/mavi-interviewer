# Oryantasyon Değerlendirme Sistemi

AI destekli gerçek zamanlı sesli oryantasyon değerlendirme sistemi.

## Proje Özeti

Yeni çalışanların oryantasyon eğitimlerinden öğrendiklerini yapay zeka ile değerlendiren bir sistem. Önceden tanımlanmış soruları sırayla sorar, cevapları değerlendirir ve `correctOnWrong` kuralına göre geri bildirim verir.

## Tech Stack

| Katman | Teknoloji |
|--------|-----------|
| Frontend | Next.js 15 (App Router), TailwindCSS, shadcn/ui, Zustand |
| Backend | Node.js + Express.js, PostgreSQL (Neon) |
| AI | OpenAI GPT-4o-mini (cevap değerlendirme), ElevenLabs (TTS), Simli (Avatar) |
| Realtime | WebSocket (ws) |
| Package Manager | pnpm (monorepo) |

## Temel Akış

1. HR uygulaması `POST /sessions` ile oturum oluşturur
2. Çalışan `joinUrl` ile değerlendirmeye katılır
3. AI `introText` ile karşılar, soruları sırayla sorar
4. Cevaplar `correctAnswer` ile karşılaştırılır
5. `correctOnWrong=true` ise yanlış cevaba düzeltme verilir
6. Tüm sorular bitince `closingText` söylenir
7. Transcript `callbackUrl`'e POST edilir

## Environment Variables

```env
# Server
PORT=2223
NODE_ENV=development
FRONTEND_URL=http://localhost:2222

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://...

# API Key (session creation auth)
ATS_API_KEY=your-api-key

# AI Services
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=...
SIMLI_API_KEY=...

# Audio Recording
AUDIO_RECORDING_ENABLED=true
AZURE_STORAGE_CONNECTION_STRING=...
AZURE_STORAGE_CONTAINER_NAME=interview-recordings
```

## Durum

| Phase | Durum |
|-------|-------|
| DB & Migrations | ✅ Tamamlandı |
| Shared Types | ✅ Tamamlandı |
| Backend API | ✅ Tamamlandı |
| Frontend | ✅ Tamamlandı |
| Dokümantasyon | ✅ Tamamlandı |
