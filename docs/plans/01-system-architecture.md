# BÖLÜM 1: SİSTEM MİMARİSİ

> **Versiyon:** 1.1  
> **Son Güncelleme:** 2026-01-23  
> **Durum:** ✅ Onaylandı

---

## 1.1 Genel Bakış

AI Interview, yapay zeka destekli gerçek zamanlı sesli görüşme sistemidir. Sistem, HR ATS'den bağımsız çalışır ve REST API üzerinden entegre olur.

### Temel Özellikler
- Tek cihaz bağlantısı (aynı session'a tek client)
- Sadece ses tabanlı görüşme (video Faz 2+)
- Tek avatar (customization yok)
- 10-50 eşzamanlı görüşme kapasitesi
- Bağlantı kopmasında aynı session ile devam (session aktifse)

### Kapsam Dışı (MVP / Faz 1)
- Session expire süresi
- Video görüşme
- Avatar customization
- Audio kayıt saklama
- Native mobile app
- Kompleks retry/fallback mekanizmaları

---

## 1.2 Tech Stack

| Katman | Teknoloji | Notlar |
|--------|-----------|--------|
| **Frontend** | Next.js 14+ (App Router) | |
| **Styling** | TailwindCSS + shadcn/ui | |
| **State Management** | Zustand | |
| **Backend** | Node.js + Express.js | WebSocket için ws paketi |
| **Database** | PostgreSQL | |
| **Cache/Session** | Redis | Faz 2'de eklenecek |
| **LLM** | Claude 3.5 Sonnet | Anthropic API |
| **STT** | OpenAI Whisper | Backend API üzerinden |
| **TTS** | ElevenLabs | Backend üzerinden streaming |
| **Avatar** | Simli | WebRTC lip-sync |
| **Realtime** | WebSocket (ws) | Express.js ile entegre |
| **Package Manager** | pnpm | Monorepo |

---

## 1.3 Yüksek Seviye Mimari

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL SYSTEMS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│    ┌──────────────┐                                                         │
│    │   HR ATS     │                                                         │
│    │   Sistemi    │                                                         │
│    └──────┬───────┘                                                         │
│           │ POST /sessions                                                  │
│           │ {position, candidate, topics}                                   │
│           ▼                                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                              CLIENT LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│    ┌─────────────────────────────────────────────────────────────────┐     │
│    │                    Next.js Frontend                              │     │
│    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │     │
│    │  │  Interview  │  │  WebSocket  │  │     Media Layer         │  │     │
│    │  │    Page     │  │   Client    │  │  ┌─────────┐ ┌───────┐  │  │     │
│    │  │ /interview/ │  │             │  │  │ Audio   │ │Simli  │  │  │     │
│    │  │ [sessionId] │  │             │  │  │ Capture │ │Avatar │  │  │     │
│    │  └─────────────┘  └──────┬──────┘  │  └────┬────┘ └───────┘  │  │     │
│    │                          │         │       │                  │  │     │
│    └──────────────────────────┼─────────┼───────┼──────────────────┘  │     │
│                               │         │       │                      │     │
│                               │ WS      │       │ Backend API          │     │
│                               │         │       │ (Whisper STT)        │     │
├───────────────────────────────┼─────────┼───────┼──────────────────────┴─────┤
│                              BACKEND LAYER                                   │
├───────────────────────────────┼─────────┼───────┼────────────────────────────┤
│                               │         │       │                            │
│    ┌──────────────────────────▼─────────┼───────┼────────────────────────┐   │
│    │                Express.js + WebSocket Server                        │   │
│    │  ┌─────────────┐  ┌─────────────┐  │       │                        │   │
│    │  │  REST API   │  │  WebSocket  │  │       │                        │   │
│    │  │   Routes    │  │   Handler   │◄─┘       │                        │   │
│    │  └──────┬──────┘  └──────┬──────┘          │                        │   │
│    │         │                │                  │                        │   │
│    │  ┌──────▼────────────────▼──────────────────▼────────────────────┐  │   │
│    │  │                    Core Services                              │  │   │
│    │  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐  │  │   │
│    │  │  │ Session    │  │ Interview  │  │    Audio Pipeline      │  │  │   │
│    │  │  │ Manager    │  │ Engine     │  │  (TTS orchestration)   │  │  │   │
│    │  │  └────────────┘  └────────────┘  └────────────────────────┘  │  │   │
│    │  │  ┌────────────┐                                              │  │   │
│    │  │  │ Transcript │                                              │  │   │
│    │  │  │ Service    │                                              │  │   │
│    │  │  └────────────┘                                              │  │   │
│    │  └──────────────────────────────────────────────────────────────┘  │   │
│    └─────────────────────────────────────────────────────────────────────┘   │
│                               │                                              │
├───────────────────────────────┼──────────────────────────────────────────────┤
│                              DATA LAYER                                      │
├───────────────────────────────┼──────────────────────────────────────────────┤
│                               │                                              │
│    ┌──────────────────────────▼──────────────────────────────────────────┐   │
│    │                       PostgreSQL                                    │   │
│    │   sessions | transcript_entries | interview_configs | session_events│   │
│    └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                           AI & MEDIA SERVICES                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│    │  Claude    │  │   OpenAI   │  │ ElevenLabs │  │   Simli    │           │
│    │  3.5       │  │  Whisper   │  │    TTS     │  │   Avatar   │           │
│    │  Sonnet    │  │    STT     │  │ (streaming)│  │  (WebRTC)  │           │
│    └────────────┘  └────────────┘  └────────────┘  └────────────┘           │
│         ▲               ▲               ▲               ▲                    │
│         │               │               │               │                    │
│    Backend API     Backend API    Backend API    Frontend Direct            │
│                    (REST endpoint)                    (WebRTC)              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 1.4 Data Flow Diyagramları

### 1.4.1 Görüşme Başlatma Akışı

```
ATS                    Interview API              PostgreSQL
 │                          │                         │
 │  POST /sessions          │                         │
 │  {position, candidate,   │                         │
 │   interview_topics}      │                         │
 │─────────────────────────►│                         │
 │                          │                         │
 │                          │  INSERT session         │
 │                          │  INSERT interview_config│
 │                          │────────────────────────►│
 │                          │                         │
 │                          │  session_id             │
 │                          │◄────────────────────────│
 │                          │                         │
 │  {sessionId, joinUrl}    │                         │
 │◄─────────────────────────│                         │
 │                          │                         │

joinUrl format: https://interview.example.com/interview/{sessionId}
```

### 1.4.2 Realtime Görüşme Döngüsü

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GÖRÜŞME DÖNGÜSÜ                                      │
└─────────────────────────────────────────────────────────────────────────────┘

  Client          WS Server       Interview      Claude      ElevenLabs    Simli
    │                │             Engine          │             │           │
    │   connect      │                │            │             │           │
    │───────────────►│                │            │             │           │
    │                │  load session  │            │             │           │
    │                │───────────────►│            │             │           │
    │   ready + state│                │            │             │           │
    │◄───────────────│                │            │             │           │
    │                │                │            │             │           │
    │                │   ┌────────────────────────────────────────────────┐  │
    │                │   │              SORU-CEVAP DÖNGÜSÜ               │  │
    │                │   └────────────────────────────────────────────────┘  │
    │                │                │            │             │           │
    │                │                │  generate  │             │           │
    │                │                │  question  │             │           │
    │                │                │───────────►│             │           │
    │                │                │  question  │             │           │
    │                │                │◄───────────│             │           │
    │                │                │            │             │           │
    │                │                │   TTS request           │           │
    │                │                │─────────────────────────►│           │
    │                │                │                          │           │
    │                │                │   Start lip-sync         │           │
    │                │                │──────────────────────────────────────►│
    │                │                │                          │           │
    │  audio:chunk   │   streaming    │                          │           │
    │◄───────────────│◄──────────────────────────────────────────│           │
    │                │                │                          │           │
    │  avatar video  │                │                          │           │
    │◄────────────────────────────────────────────────────────────────────────│
    │                │                │                          │           │
    │ ai:speaking:end│                │                          │           │
    │◄───────────────│                │                          │           │
    │                │                │                          │           │
    │ candidate:start│                │                          │           │
    │───────────────►│                │                          │           │
    │                │                │                          │           │
    │  audio stream ─┼────────────────┼──► Backend (Whisper API)  │           │
    │                │                │              │           │           │
    │                │                │   transcript │           │           │
    │◄───────────────┼────────────────┼──────────────┘           │           │
    │                │                │                          │           │
    │  [VAD: silence detected]        │                          │           │
    │                │                │                          │           │
    │ candidate:end  │                │                          │           │
    │◄───────────────│                │                          │           │
    │                │                │                          │           │
    │                │   save answer  │                          │           │
    │                │───────────────►│                          │           │
    │                │                │                          │           │
    │                │                │  evaluate +  │           │           │
    │                │                │  next action │           │           │
    │                │                │─────────────►│           │           │
    │                │                │  {action}    │           │           │
    │                │                │◄─────────────│           │           │
    │                │                │            │             │           │
    │                │   └─────── DÖNGÜ TEKRAR ───────┘          │           │
    │                │                │            │             │           │
```

### 1.4.3 Interrupt (Kesme) Akışı

```
Client              WS Server           ElevenLabs          Simli
  │                     │                    │                │
  │  [AI konuşuyor]     │                    │                │
  │◄────────────────────│◄───────────────────│                │
  │◄──────────────────────────────────────────────────────────│
  │                     │                    │                │
  │  candidate:interrupt│                    │                │
  │────────────────────►│                    │                │
  │                     │                    │                │
  │                     │   cancel stream    │                │
  │                     │───────────────────►│                │
  │                     │                    │                │
  │                     │   stop speaking    │                │
  │                     │────────────────────────────────────►│
  │                     │                    │                │
  │  ai:interrupted     │                    │                │
  │◄────────────────────│                    │                │
  │                     │                    │                │
  │  [Aday konuşmaya başlayabilir]           │                │
  │                     │                    │                │
```

---

## 1.5 WebSocket Bağlantı Mimarisi

### 1.5.1 Bağlantı Yapısı

```
┌─────────────────────────────────────────────────────────────┐
│                    WebSocket Server                          │
│                    wss://api.example.com/ws                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              Connection Manager                      │   │
│   │                                                     │   │
│   │   connections: Map<sessionId, WebSocket>            │   │
│   │                                                     │   │
│   │   • Tek session = Tek connection                    │   │
│   │   • Yeni bağlantı = Eski bağlantıyı kapat          │   │
│   │                                                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              Session Rooms                           │   │
│   │                                                     │   │
│   │   session-abc123 ──► Client Connection              │   │
│   │   session-def456 ──► Client Connection              │   │
│   │   session-ghi789 ──► Client Connection              │   │
│   │   ...                                               │   │
│   │                                                     │   │
│   │   Max concurrent: ~50                               │   │
│   │                                                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.5.2 WebSocket Event Kategorileri

| Kategori | Yön | Events | Açıklama |
|----------|-----|--------|----------|
| **Connection** | Bidirectional | `connection:ready`, `connection:error` | Bağlantı yönetimi |
| **Interview Control** | Client→Server | `interview:start`, `interview:end` | Görüşme kontrolü |
| **Audio (Client)** | Client→Server | `candidate:speaking:start`, `candidate:speaking:end`, `candidate:interrupt` | Aday ses kontrolü |
| **Audio (Server)** | Server→Client | `ai:speaking:start`, `ai:speaking:end`, `audio:chunk` | AI ses stream |
| **Transcript** | Server→Client | `transcript:partial`, `transcript:final` | STT sonuçları |
| **State** | Server→Client | `phase:changed`, `question:new` | Durum güncellemeleri |
| **Error** | Server→Client | `error` | Hata bildirimleri |

---

## 1.6 Error Handling Stratejisi (MVP)

### 1.6.1 Hata Kategorileri

| Kategori | Örnekler | MVP Stratejisi | Kullanıcı Etkisi |
|----------|----------|----------------|------------------|
| **Network** | WebSocket kopması | Kullanıcıya hata göster, sayfayı yenile butonu | "Bağlantı koptu, yeniden bağlanmak için tıklayın" |
| **Whisper** | STT error | Hata mesajı göster | "Ses tanıma hatası, lütfen tekrar deneyin" |
| **ElevenLabs** | TTS error | Hata mesajı göster | "Ses üretme hatası" |
| **Claude** | LLM error | Hata mesajı göster | "Yapay zeka yanıt veremedi" |
| **Simli** | Avatar error | Avatar olmadan devam et | Avatar görünmez |
| **Validation** | Invalid session | Error sayfası | "Görüşme bulunamadı" |
| **System** | DB error | Log + error sayfası | "Teknik bir sorun oluştu" |

### 1.6.2 Basit Reconnection (MVP)

MVP için karmaşık otomatik reconnect yerine basit bir yaklaşım:

```
[Bağlantı Koptu]
       │
       ▼
┌─────────────────────────────────┐
│  "Bağlantı koptu" mesajı göster │
│  [Yeniden Bağlan] butonu        │
└─────────────────────────────────┘
       │
       │ Kullanıcı tıkladı
       ▼
┌─────────────────────────────────┐
│  Sayfa yenilenir                │
│  Session DB'den yüklenir        │
│  Kaldığı yerden devam           │
└─────────────────────────────────┘
```

**Not:** Otomatik reconnect, exponential backoff ve graceful degradation Faz 2'de eklenecek.

---

## 1.7 Whisper STT Entegrasyonu

Audio transcription backend üzerinden OpenAI Whisper API ile yapılır. Frontend ses kaydını backend'e gönderir, backend Whisper API'ye iletir ve transcript sonucunu döner.

```
┌─────────────────────────────────────────────────────────────┐
│               WHISPER STT (Backend API)                       │
└─────────────────────────────────────────────────────────────┘

  Client                        Backend                 OpenAI
    │                              │                       │
    │  Audio blob (POST /transcribe)                      │
    │─────────────────────────────►│                       │
    │                              │  Whisper API          │
    │                              │──────────────────────►│
    │                              │  transcript           │
    │                              │◄──────────────────────│
    │  { text }                    │                       │
    │◄─────────────────────────────│                       │
    │                              │                       │
```

**Not:** API key tamamen backend'de tutulur, frontend'e expose edilmez.

---

## 1.8 Kesinleşen Kararlar Özeti

| Karar | Değer | Notlar |
|-------|-------|--------|
| Eşzamanlı görüşme | 10-50 | Single instance yeterli |
| Session başına client | 1 | Yeni bağlantı eskiyi kapatır |
| Session expire | Yok | Faz 2'de eklenecek |
| Reconnect | Manuel | Sayfa yenileme ile |
| Data retention | Süresiz | GDPR/KVKK scope dışı |
| Audio kayıt | Hayır | Sadece transcript |
| Video | Hayır | Faz 2+ |
| Avatar | Tek, sabit | Customization yok |
| STT (Whisper) | Backend API üzerinden | API key backend'de |
| Mobile | Responsive web | Native app yok |
| Backend framework | Express.js | ws paketi ile WebSocket |

---

## 1.9 Gelecek Özellikler

Gelecek özellikler ayrı bir dosyada takip edilmektedir: [Feature Backlog](../features/backlog.md)

---

**Sonraki Bölüm:** [02-database-design.md](./02-database-design.md)
