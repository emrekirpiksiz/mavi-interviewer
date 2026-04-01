# BÖLÜM 2: DATABASE DESIGN

> **Versiyon:** 1.0  
> **Son Güncelleme:** 2026-01-23  
> **Durum:** ✅ Onaylandı

---

## 2.1 Genel Bakış

PostgreSQL kullanılacak. Veri yapısı esnek olması için kritik alanlar JSONB formatında tutulacak (ATS'den gelen veriler değişebilir).

### Tasarım Prensipleri
- **JSONB tercih:** Position, candidate, topics verileri JSONB olarak saklanacak (esneklik)
- **Soft delete:** Tüm tablolarda `deleted_at` kolonu
- **Transcript granularity:** Her konuşma (AI sorusu / Aday cevabı) ayrı satır
- **Audit log:** Önemli olaylar `session_events` tablosunda

---

## 2.2 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATABASE SCHEMA                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐
│        sessions          │
├──────────────────────────┤
│ id (PK, UUID)            │
│ status                   │
│ current_phase            │
│ current_question_index   │
│ started_at               │
│ ended_at                 │
│ created_at               │
│ updated_at               │
│ deleted_at               │
└──────────┬───────────────┘
           │
           │ 1:1
           ▼
┌──────────────────────────┐
│    interview_configs     │
├──────────────────────────┤
│ id (PK, UUID)            │
│ session_id (FK, UNIQUE)  │◄──────────────────────────────────┐
│ position_data (JSONB)    │                                   │
│ candidate_data (JSONB)   │                                   │
│ topics (JSONB)           │                                   │
│ created_at               │                                   │
│ deleted_at               │                                   │
└──────────────────────────┘                                   │
                                                               │
┌──────────────────────────┐       ┌──────────────────────────┐│
│   transcript_entries     │       │     session_events       ││
├──────────────────────────┤       ├──────────────────────────┤│
│ id (PK, UUID)            │       │ id (PK, UUID)            ││
│ session_id (FK)          │───────│ session_id (FK)          │┘
│ sequence_number          │       │ event_type               │
│ speaker                  │       │ event_data (JSONB)       │
│ content                  │       │ created_at               │
│ phase                    │       └──────────────────────────┘
│ question_context         │
│ timestamp_ms             │
│ created_at               │
│ deleted_at               │
└──────────────────────────┘
```

---

## 2.3 Tablo Detayları

### 2.3.1 `sessions` Tablosu

Ana görüşme tablosu. Her ATS isteği bir session oluşturur.

```sql
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status session_status NOT NULL DEFAULT 'pending',
    current_phase interview_phase NOT NULL DEFAULT 'introduction',
    current_question_index INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);
```

| Kolon | Tip | Açıklama |
|-------|-----|----------|
| `id` | UUID | Primary key, ATS'e dönülecek sessionId |
| `status` | ENUM | Görüşme durumu |
| `current_phase` | ENUM | Aktif görüşme fazı |
| `current_question_index` | INTEGER | Mevcut sorunun sırası (0-based) |
| `started_at` | TIMESTAMP | Görüşme başlangıç zamanı (ilk WS bağlantısı) |
| `ended_at` | TIMESTAMP | Görüşme bitiş zamanı |
| `created_at` | TIMESTAMP | Kayıt oluşturulma |
| `updated_at` | TIMESTAMP | Son güncelleme |
| `deleted_at` | TIMESTAMP | Soft delete |

---

### 2.3.2 `interview_configs` Tablosu

ATS'den gelen tüm konfigürasyon verisi. JSONB olarak saklanır.

```sql
CREATE TABLE interview_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
    position_data JSONB NOT NULL,
    candidate_data JSONB NOT NULL,
    topics JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);
```

| Kolon | Tip | Açıklama |
|-------|-----|----------|
| `id` | UUID | Primary key |
| `session_id` | UUID | Foreign key → sessions (1:1 ilişki) |
| `position_data` | JSONB | Şirket, pozisyon, sorumluluklar, gereksinimler |
| `candidate_data` | JSONB | Ad, deneyimler, eğitim, yetenekler |
| `topics` | JSONB | Interview topics array |
| `created_at` | TIMESTAMP | Kayıt oluşturulma |
| `deleted_at` | TIMESTAMP | Soft delete |

**JSONB Yapıları:**

`position_data` örneği:
```json
{
  "company": {
    "name": "TechCorp",
    "industry": "E-ticaret",
    "size": "200-500 çalışan",
    "tech_stack": ["React", "Node.js", "PostgreSQL", "AWS"]
  },
  "title": "Senior Frontend Developer",
  "responsibilities": [
    "React ve TypeScript ile karmaşık UI componentleri geliştirme",
    "..."
  ],
  "requirements": [
    "En az 4 yıl frontend geliştirme deneyimi",
    "..."
  ]
}
```

`candidate_data` örneği:
```json
{
  "name": "Ahmet Yılmaz",
  "experiences": [
    {
      "title": "Senior Frontend Developer",
      "company": "TechMart (E-ticaret)",
      "duration": "Mart 2022 - Halen (2 yıl 10 ay)",
      "description": "2M+ aktif kullanıcılı e-ticaret platformunda..."
    }
  ],
  "education": [
    {
      "degree": "Lisans - Bilgisayar Mühendisliği",
      "school": "ODTÜ",
      "duration": "2014 - 2018",
      "gpa": "3.2/4.0"
    }
  ],
  "skills": ["React (4.5 yıl)", "TypeScript (3 yıl)", "..."]
}
```

`topics` örneği:
```json
[
  {
    "category": "technical",
    "topic": "React",
    "description": "React hooks, component lifecycle...",
    "scoring": {
      "scale": "0-10",
      "minimum_expected": 7,
      "importance": 5
    },
    "evaluation_guide": "Hooks kullanımı, useEffect dependency array..."
  }
]
```

> **Not:** `importance` değeri 1-5 arası sayısal:
> - 1: Nice to have
> - 2: Low
> - 3: Medium
> - 4: High
> - 5: Critical (must have)

---

### 2.3.3 `transcript_entries` Tablosu

Görüşmedeki her konuşma kaydı. Her AI sorusu ve aday cevabı ayrı satır.

```sql
CREATE TABLE transcript_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL,
    speaker speaker_type NOT NULL,
    content TEXT NOT NULL,
    phase interview_phase NOT NULL,
    question_context TEXT,
    timestamp_ms BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(session_id, sequence_number)
);
```

| Kolon | Tip | Açıklama |
|-------|-----|----------|
| `id` | UUID | Primary key |
| `session_id` | UUID | Foreign key → sessions |
| `sequence_number` | INTEGER | Sıra numarası (1, 2, 3...) |
| `speaker` | ENUM | `ai` veya `candidate` |
| `content` | TEXT | Konuşma metni |
| `phase` | ENUM | Hangi fazda söylendi |
| `question_context` | TEXT | Hangi konuya dair soru (örn: "React") |
| `timestamp_ms` | BIGINT | Görüşme başından itibaren ms |
| `created_at` | TIMESTAMP | Kayıt oluşturulma |
| `deleted_at` | TIMESTAMP | Soft delete |

---

### 2.3.4 `session_events` Tablosu

Görüşme sırasındaki önemli olaylar (audit log).

```sql
CREATE TABLE session_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

| Kolon | Tip | Açıklama |
|-------|-----|----------|
| `id` | UUID | Primary key |
| `session_id` | UUID | Foreign key → sessions |
| `event_type` | VARCHAR(50) | Olay tipi |
| `event_data` | JSONB | Olay detayları (opsiyonel) |
| `created_at` | TIMESTAMP | Olay zamanı |

**Event Types:**

| Event Type | Açıklama | Event Data |
|------------|----------|------------|
| `session_created` | ATS'den session oluşturuldu | - |
| `session_started` | Görüşme başladı (WS bağlantısı) | - |
| `session_ended` | Görüşme tamamlandı | `{reason: "completed"}` |
| `phase_changed` | Faz değişti | `{from: "introduction", to: "experience"}` |
| `connection_lost` | WebSocket koptu | - |
| `connection_restored` | Yeniden bağlantı | - |
| `interrupt_triggered` | Aday AI'ı kesti | - |
| `error_occurred` | Hata oluştu | `{error: "...", service: "whisper"}` |
| `ats_callback_sent` | ATS'e transcript gönderildi | `{success: true}` |

---

## 2.4 ENUM Tipleri

```sql
-- Session durumları
CREATE TYPE session_status AS ENUM (
    'pending',      -- ATS'den oluşturuldu, görüşme başlamadı
    'active',       -- Görüşme devam ediyor
    'completed',    -- Görüşme başarıyla tamamlandı
    'failed'        -- Hata nedeniyle sonlandı
);

-- Görüşme fazları
CREATE TYPE interview_phase AS ENUM (
    'introduction',  -- Tanışma, görüşme kuralları
    'experience',    -- Deneyim soruları
    'technical',     -- Teknik sorular
    'behavioral',    -- Davranışsal sorular
    'motivation',    -- Motivasyon, kariyer hedefleri
    'closing'        -- Kapanış, sorular var mı
);

-- Konuşmacı
CREATE TYPE speaker_type AS ENUM (
    'ai',
    'candidate'
);
```

---

## 2.5 Index Stratejisi

```sql
-- Session lookup (PK zaten index)

-- Status bazlı filtreleme
CREATE INDEX idx_sessions_status ON sessions(status) WHERE deleted_at IS NULL;

-- Interview config lookup (session_id UNIQUE constraint zaten index oluşturur)

-- Transcript sorgulama - sıralı okuma için
CREATE INDEX idx_transcript_session_seq ON transcript_entries(session_id, sequence_number) 
    WHERE deleted_at IS NULL;

-- Events sorgulama - session'a ait eventleri çekmek için
CREATE INDEX idx_events_session_created ON session_events(session_id, created_at);

-- Soft delete'li kayıtları hızlı filtreleme
CREATE INDEX idx_sessions_not_deleted ON sessions(id) WHERE deleted_at IS NULL;
```

---

## 2.6 Örnek Veriler

### 2.6.1 Session Oluşturma (ATS Request sonrası)

```sql
-- 1. Session oluştur
INSERT INTO sessions (id, status, current_phase, current_question_index)
VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    'pending',
    'introduction',
    0
);

-- 2. Interview config oluştur (ATS'den gelen veri)
INSERT INTO interview_configs (session_id, position_data, candidate_data, topics)
VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    '{"company": {"name": "TechCorp", ...}, "title": "Senior Frontend Developer", ...}'::jsonb,
    '{"name": "Ahmet Yılmaz", "experiences": [...], ...}'::jsonb,
    '[{"category": "technical", "topic": "React", ...}, ...]'::jsonb
);

-- 3. Event kaydet
INSERT INTO session_events (session_id, event_type)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'session_created');
```

### 2.6.2 Görüşme Başladığında

```sql
-- Session durumunu güncelle
UPDATE sessions 
SET status = 'active', 
    started_at = NOW(), 
    updated_at = NOW()
WHERE id = '550e8400-e29b-41d4-a716-446655440000';

-- Event kaydet
INSERT INTO session_events (session_id, event_type)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'session_started');
```

### 2.6.3 Transcript Kayıtları

```sql
-- AI sorusu
INSERT INTO transcript_entries 
    (session_id, sequence_number, speaker, content, phase, question_context, timestamp_ms)
VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    1,
    'ai',
    'Merhaba Ahmet, TechCorp Senior Frontend Developer pozisyonu için görüşmemize hoş geldin.',
    'introduction',
    NULL,
    0
);

-- AI sorusu (technical)
INSERT INTO transcript_entries 
    (session_id, sequence_number, speaker, content, phase, question_context, timestamp_ms)
VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    2,
    'ai',
    'React''te useEffect hook''unu kullanırken dependency array''in önemini anlatır mısın?',
    'technical',
    'React',
    45000
);

-- Aday cevabı
INSERT INTO transcript_entries 
    (session_id, sequence_number, speaker, content, phase, question_context, timestamp_ms)
VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    3,
    'candidate',
    'Tabii, useEffect''te dependency array aslında React''e bu effect''in hangi değerlere bağlı olduğunu söylüyor. Eğer boş array verirsek sadece mount''ta çalışır, hiç vermezsek her renderda çalışır.',
    'technical',
    'React',
    47500
);
```

### 2.6.4 Görüşme Bitişinde

```sql
-- Session tamamla
UPDATE sessions 
SET status = 'completed', 
    ended_at = NOW(), 
    updated_at = NOW()
WHERE id = '550e8400-e29b-41d4-a716-446655440000';

-- Event kaydet
INSERT INTO session_events (session_id, event_type, event_data)
VALUES (
    '550e8400-e29b-41d4-a716-446655440000', 
    'session_ended', 
    '{"reason": "completed"}'::jsonb
);
```

---

## 2.7 Sık Kullanılacak Sorgular

### Session ve Config'i birlikte çekme

```sql
SELECT 
    s.*,
    ic.position_data,
    ic.candidate_data,
    ic.topics
FROM sessions s
JOIN interview_configs ic ON s.id = ic.session_id
WHERE s.id = $1 AND s.deleted_at IS NULL;
```

### Tam transcript çekme (sıralı)

```sql
SELECT 
    sequence_number,
    speaker,
    content,
    phase,
    question_context,
    timestamp_ms
FROM transcript_entries
WHERE session_id = $1 AND deleted_at IS NULL
ORDER BY sequence_number ASC;
```

### ATS'e gönderilecek transcript formatı

```sql
SELECT 
    s.id as session_id,
    s.started_at,
    s.ended_at,
    ic.candidate_data->>'name' as candidate_name,
    ic.position_data->>'title' as position_title,
    json_agg(
        json_build_object(
            'sequence', te.sequence_number,
            'speaker', te.speaker,
            'content', te.content,
            'phase', te.phase,
            'topic', te.question_context,
            'timestamp_ms', te.timestamp_ms
        ) ORDER BY te.sequence_number
    ) as transcript
FROM sessions s
JOIN interview_configs ic ON s.id = ic.session_id
JOIN transcript_entries te ON s.id = te.session_id
WHERE s.id = $1 
  AND s.deleted_at IS NULL 
  AND te.deleted_at IS NULL
GROUP BY s.id, ic.candidate_data, ic.position_data;
```

---

## 2.8 Migration Stratejisi

Migration'lar sıralı çalıştırılacak:

```
migrations/
├── 001_create_enums.sql
├── 002_create_sessions.sql
├── 003_create_interview_configs.sql
├── 004_create_transcript_entries.sql
├── 005_create_session_events.sql
└── 006_create_indexes.sql
```

---

## 2.9 Kesinleşen Kararlar

| Karar | Değer | Gerekçe |
|-------|-------|---------|
| JSONB kullanımı | Evet | ATS veri yapısı değişebilir, esneklik gerekli |
| Transcript granularity | Her konuşma ayrı satır | Analiz ve replay için uygun |
| Soft delete | Evet | Veri kaybı önleme |
| ATS callback tracking | Basit (event log) | Retry mekanizması yok, sadece log |
| Phase tracking ayrı tablo | Hayır | Transcript üzerinden analiz yeterli |

---

## 2.10 Açık Konular (Faz 2+)

1. Partitioning (çok fazla transcript biriktikten sonra)
2. Archiving stratejisi (eski görüşmeler)
3. Full-text search (transcript içinde arama)
4. Analytics view'ları

---

**Önceki Bölüm:** [01-system-architecture.md](./01-system-architecture.md)  
**Sonraki Bölüm:** [03-api-design.md](./03-api-design.md)
