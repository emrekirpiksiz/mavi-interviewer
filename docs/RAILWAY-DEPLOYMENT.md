# Railway Deployment Rehberi

Bu doküman AI Interview projesinin Railway'e nasıl deploy edileceğini anlatır.

## Mimari Özet

```
┌─────────────────────────────────────────────────────────────┐
│                        RAILWAY                               │
│  ┌─────────────┐         ┌─────────────────────┐           │
│  │  Next.js    │  WS/HTTP│  Express.js         │           │
│  │  Frontend   │◄───────►│  Backend + WS       │           │
│  │  (web)      │         │  (api)              │           │
│  └─────────────┘         └──────────┬──────────┘           │
└──────────────────────────────────────┼─────────────────────┘
                                       │
                                       ▼
                              ┌─────────────┐
                              │    NEON     │
                              │  PostgreSQL │
                              └─────────────┘
```

## Ön Gereksinimler

1. [Railway hesabı](https://railway.app)
2. [Neon hesabı](https://neon.tech) (veya Railway PostgreSQL)
3. GitHub repository (projenin push edilmiş olması)

---

## Adım 1: Neon Database Kurulumu

### 1.1 Neon'da Proje Oluştur

1. https://neon.tech adresine git
2. "Create a project" tıkla
3. Ayarlar:
   - **Project name:** ai-interview
   - **Region:** US East (Ohio) - Railway ile aynı region
4. Database oluşturulunca connection string'i kopyala

### 1.2 Connection String

```
# Pooled connection (önerilen)
postgresql://user:pass@ep-xxx-pooler.us-east-1.aws.neon.tech/interview_db?sslmode=require
```

> **Not:** `-pooler` ekli URL'yi kullan (connection pooling için)

### 1.3 Migration Çalıştır

Lokal'den migration çalıştır:

```bash
# .env dosyasına Neon URL'yi ekle
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.us-east-1.aws.neon.tech/interview_db?sslmode=require

# Migration çalıştır
pnpm db:migrate
```

---

## Adım 2: Railway Kurulumu

### 2.1 Railway'de Proje Oluştur

1. https://railway.app adresine git
2. "New Project" → "Deploy from GitHub repo"
3. Repository'yi seç: `ai-interview`
4. **İlk deploy'u iptal et** (konfigürasyon yapacağız)

### 2.2 API Servisi Oluştur

1. "New Service" → "GitHub Repo" → aynı repo
2. Service Settings:
   - **Name:** `api`
   - **Root Directory:** `/` (monorepo root)
   - **Dockerfile Path:** `apps/api/Dockerfile`
   - **Watch Paths:** `apps/api/**`, `packages/shared/**`

### 2.3 API Environment Variables

Railway dashboard'da API servisine şu değişkenleri ekle:

```env
# Database (Neon pooled URL)
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.us-east-1.aws.neon.tech/interview_db?sslmode=require

# Server
PORT=3001
NODE_ENV=production

# AI Services (kendi API key'lerinizi girin)
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
ELEVENLABS_API_KEY=xxx
ELEVENLABS_VOICE_ID=pFZP5JQG7iQjIQuC4Bku

# CORS - Web deploy edildikten sonra güncellenecek
FRONTEND_URL=https://web-production-xxx.up.railway.app
```

### 2.4 Web Servisi Oluştur

1. "New Service" → "GitHub Repo" → aynı repo
2. Service Settings:
   - **Name:** `web`
   - **Root Directory:** `/` (monorepo root)
   - **Dockerfile Path:** `apps/web/Dockerfile`
   - **Watch Paths:** `apps/web/**`, `packages/shared/**`

### 2.5 Web Environment Variables

```env
# API URL (API deploy edildikten sonra)
NEXT_PUBLIC_API_URL=https://api-production-xxx.up.railway.app
NEXT_PUBLIC_WS_URL=wss://api-production-xxx.up.railway.app/ws

# Simli (opsiyonel)
NEXT_PUBLIC_SIMLI_API_KEY=xxx
```

> **Önemli:** Build-time variables için Railway'de "Build Arguments" olarak da ekleyin:
> - NEXT_PUBLIC_API_URL
> - NEXT_PUBLIC_WS_URL
> - NEXT_PUBLIC_SIMLI_API_KEY

---

## Adım 3: Deploy ve Doğrulama

### 3.1 Deploy Sırası

1. Önce **API** servisini deploy et
2. API URL'ini al (örn: `https://api-production-xxx.up.railway.app`)
3. Web servisinin environment variables'ını güncelle
4. **Web** servisini deploy et
5. API'nin FRONTEND_URL'ini güncelle (CORS için)
6. Her iki servisi redeploy et

### 3.2 URL'leri Al

Railway dashboard'da her servisin "Settings" → "Domains" kısmından URL'leri al:

```
API: https://api-production-xxx.up.railway.app
Web: https://web-production-xxx.up.railway.app
```

### 3.3 Health Check

```bash
# API health check
curl https://api-production-xxx.up.railway.app/health

# Beklenen yanıt:
# {"status":"healthy","timestamp":"2026-02-02T...","db":"connected"}
```

### 3.4 Test Session Oluştur

```bash
curl -X POST https://api-production-xxx.up.railway.app/api/mock-ats/create-session

# Dönen joinUrl'i tarayıcıda aç
```

---

## Custom Domain (Opsiyonel)

### Railway'de Custom Domain

1. Service Settings → Domains → "Add Custom Domain"
2. DNS'te CNAME kaydı ekle:
   - `api.yourdomain.com` → Railway domain
   - `app.yourdomain.com` → Railway domain

---

## Troubleshooting

### Build Hatası: pnpm not found

Railway Dockerfile'ı düzgün kullanmıyorsa:

```bash
# Dockerfile'ın doğru yolda olduğundan emin ol
apps/api/Dockerfile
apps/web/Dockerfile
```

### WebSocket Bağlantı Hatası

1. API'nin CORS ayarlarını kontrol et
2. `FRONTEND_URL` doğru mu?
3. `NEXT_PUBLIC_WS_URL` protokolü `wss://` mi?

### Database Bağlantı Hatası

1. Neon URL'de `-pooler` var mı?
2. `?sslmode=require` ekli mi?
3. IP whitelist gerekiyor mu? (Neon'da varsayılan: tüm IP'ler)

### Cold Start Yavaşlığı

Neon free tier'da ilk bağlantı yavaş olabilir (cold start). Düzeltmek için:
- Neon Pro plan (always-on compute)
- Veya Railway PostgreSQL kullan

---

## Maliyet Tahmini

| Servis | Plan | Maliyet/ay |
|--------|------|------------|
| Neon | Free | $0 |
| Railway API | Usage | ~$5-10 |
| Railway Web | Usage | ~$3-5 |
| **Toplam** | | **~$8-15** |

---

## Manuel Deploy (Railway CLI)

GitHub push otomatik tetiklemiyorsa Railway CLI ile deploy edebilirsin.

### Kurulum (bir kerelik)

```bash
brew install railway
railway login          # Tarayıcı açılır, giriş yap
cd /path/to/ai-interview
railway link           # Proje: ai-interview, Servis: web (veya api)
```

### Web deploy

```bash
# Önce web servisine link et (sadece ilk kez veya servis değiştirdiysen)
railway link   # → web servisini seç

# Deploy et
./scripts/deploy-web.sh
# veya: railway up
```

### API deploy

```bash
railway link   # → api servisini seç
./scripts/deploy-api.sh
```

### Workflow özeti

```
1. Kod değiştir
2. git add . && git commit -m "mesaj" && git push
3. ./scripts/deploy-web.sh   (veya deploy-api.sh)
4. ~2-3 dk bekle → Canlıda
```

---

## Sonraki Adımlar

1. [ ] Custom domain ekle
2. [ ] Railway Pro plan (daha iyi performans)
3. [ ] Monitoring ekle (Railway metrics + Sentry)
4. [ ] CI/CD pipeline optimize et

---

**Son Güncelleme:** 2026-02-02
