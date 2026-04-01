# AI Interview - Session Oluşturma Kılavuzu

> **Versiyon:** 1.1  
> **Son Güncelleme:** 2026-02-07  
> **Hedef Kitle:** Harici ATS ve entegrasyon uygulamaları

---

## Endpoint Bilgileri

```
POST /sessions
Content-Type: application/json
X-API-Key: {ATS_API_KEY}
```

### ⚠️ Authentication (Zorunlu)

Bu endpoint `X-API-Key` header'ı ile korunmaktadır. Header gönderilmezse veya geçersiz bir key gönderilirse **401 Unauthorized** döner.

```bash
# Örnek curl komutu
curl -X POST https://api.interview.example.com/sessions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_ATS_API_KEY" \
  -d '{ ... }'
```

### Rate Limiting

Bu endpoint **10 request/dakika/IP** ile sınırlıdır. Limit aşıldığında **429 Too Many Requests** döner.

---

## 🔴 ZORUNLU ALANLAR (Request Body)

Request body'de **3 ana obje zorunludur**:

| Alan | Tip | Açıklama |
|------|-----|----------|
| `position` | object | Pozisyon ve şirket bilgileri |
| `interview_topics` | array | Görüşme konuları (min 1 eleman) |
| `candidate` | object | Aday bilgileri |

---

## 1️⃣ `position` Objesi

```json
{
  "position": {
    "company": {
      "name": "string",        // ✅ ZORUNLU - min 1 karakter
      "industry": "string",    // opsiyonel
      "size": "string",        // opsiyonel
      "tech_stack": ["string"] // opsiyonel - string array
    },
    "title": "string",                    // ✅ ZORUNLU - min 1 karakter
    "responsibilities": ["string", ...],  // ✅ ZORUNLU - min 1 eleman
    "requirements": ["string", ...]       // ✅ ZORUNLU - min 1 eleman
  }
}
```

**Sık Yapılan Hatalar:**
- `responsibilities` veya `requirements` boş array gönderilmesi → ❌ Bad Request
- `company.name` boş string gönderilmesi → ❌ Bad Request

---

## 2️⃣ `interview_topics` Array'i ⚠️ EN ÇOK HATA ALAN KISIM

```json
{
  "interview_topics": [
    {
      "category": "enum",      // ✅ ZORUNLU
      "topic": "string",       // ✅ ZORUNLU - min 1 karakter
      "description": "string", // opsiyonel
      "scoring": { ... },      // opsiyonel
      "evaluation_guide": "string" // opsiyonel
    }
  ]
}
```

### `category` Alanı - Kabul Edilen Değerler

| Değer | Açıklama |
|-------|----------|
| `technical` | Teknik sorular (React, TypeScript, vb.) |
| `behavioral` | Davranışsal sorular (STAR method) |
| `experience` | Deneyim soruları |
| `motivation` | Motivasyon soruları |
| `soft_skills` | Soft skill soruları |

**❌ Geçersiz category değerleri:**
- `"Technical"` (büyük harf) → ❌
- `"TECHNICAL"` → ❌
- `"tech"` → ❌
- `"skills"` → ❌

### `scoring` Objesi (Opsiyonel ama tam olmalı)

Eğer `scoring` gönderilecekse, **tüm alt alanları zorunludur**:

```json
{
  "scoring": {
    "scale": "string",           // ✅ ZORUNLU (scoring varsa) - örn: "0-10"
    "minimum_expected": number,  // ✅ ZORUNLU (scoring varsa) - integer
    "importance": 1|2|3|4|5      // ✅ ZORUNLU (scoring varsa) - sadece bu 5 değer
  }
}
```

**`importance` Alanı Kritik Kuralı:**
- Sadece **1, 2, 3, 4, 5** numeric değerlerini kabul eder
- String kabul etmez: `"5"` → ❌
- Başka sayılar kabul etmez: `0`, `6`, `10` → ❌

---

## 3️⃣ `candidate` Objesi

```json
{
  "candidate": {
    "name": "string",            // ✅ ZORUNLU - min 1 karakter
    "experiences": [...],        // opsiyonel
    "education": [...],          // opsiyonel
    "skills": ["string", ...]    // opsiyonel
  }
}
```

### `experiences` Array'i (Opsiyonel)

Eğer gönderilecekse, her eleman şu formatta olmalı:

```json
{
  "title": "string",       // ✅ ZORUNLU (experience varsa)
  "company": "string",     // ✅ ZORUNLU (experience varsa)
  "duration": "string",    // ✅ ZORUNLU (experience varsa)
  "description": "string"  // opsiyonel
}
```

### `education` Array'i (Opsiyonel)

```json
{
  "degree": "string",    // ✅ ZORUNLU (education varsa)
  "school": "string",    // ✅ ZORUNLU (education varsa)
  "duration": "string",  // ✅ ZORUNLU (education varsa)
  "gpa": "string"        // opsiyonel
}
```

---

## ✅ Minimal Geçerli Request Örneği

```json
{
  "position": {
    "company": {
      "name": "TechCorp"
    },
    "title": "Frontend Developer",
    "responsibilities": ["Web uygulaması geliştirme"],
    "requirements": ["3 yıl deneyim"]
  },
  "interview_topics": [
    {
      "category": "technical",
      "topic": "React"
    }
  ],
  "candidate": {
    "name": "Ahmet Yılmaz"
  }
}
```

---

## ✅ Tam Request Örneği (Tüm Alanlarla)

```json
{
  "position": {
    "company": {
      "name": "TechCorp",
      "industry": "E-ticaret",
      "size": "200-500 çalışan",
      "tech_stack": ["React", "Node.js", "PostgreSQL"]
    },
    "title": "Senior Frontend Developer",
    "responsibilities": [
      "React ile UI geliştirme",
      "Performance optimizasyonu"
    ],
    "requirements": [
      "4 yıl frontend deneyimi",
      "React ile 3 yıl deneyim"
    ]
  },
  "interview_topics": [
    {
      "category": "technical",
      "topic": "React",
      "description": "React hooks, state management",
      "scoring": {
        "scale": "0-10",
        "minimum_expected": 7,
        "importance": 5
      },
      "evaluation_guide": "Hooks kullanımını sor"
    },
    {
      "category": "soft_skills",
      "topic": "İletişim",
      "scoring": {
        "scale": "0-10",
        "minimum_expected": 6,
        "importance": 4
      }
    }
  ],
  "candidate": {
    "name": "Ahmet Yılmaz",
    "experiences": [
      {
        "title": "Frontend Developer",
        "company": "StartupX",
        "duration": "2020 - 2023",
        "description": "React ile e-ticaret platformu geliştirdim"
      }
    ],
    "education": [
      {
        "degree": "Bilgisayar Mühendisliği",
        "school": "ODTÜ",
        "duration": "2014-2018",
        "gpa": "3.2"
      }
    ],
    "skills": ["React (4 yıl)", "TypeScript (2 yıl)"]
  }
}
```

---

## ❌ Yaygın Hata Senaryoları ve Çözümleri

| Hata Mesajı | Sebep | Çözüm |
|-------------|-------|-------|
| `interview_topics.0.category: Invalid enum value` | Geçersiz category | `technical`, `behavioral`, `experience`, `motivation`, `soft_skills` kullan |
| `interview_topics: En az bir görüşme konusu gerekli` | Boş array | En az 1 topic ekle |
| `interview_topics.0.scoring.importance: Invalid literal value` | importance değeri 1-5 dışında | 1, 2, 3, 4, 5 değerlerinden birini kullan |
| `position.responsibilities: En az bir sorumluluk gerekli` | Boş array | En az 1 eleman ekle |
| `position.company.name: Şirket adı gerekli` | Boş veya eksik | Company name gir |
| `interview_topics.0.topic: Konu başlığı gerekli` | Topic boş | Topic adı gir |

---

## 🔧 Debug İçin Kontrol Listesi

Request göndermeden önce şunları kontrol edin:

- [ ] `X-API-Key` header'ı gönderiliyor mu?
- [ ] API key değeri doğru mu? (Backend `.env` dosyasındaki `ATS_API_KEY` ile eşleşmeli)
- [ ] `position.company.name` dolu mu?
- [ ] `position.title` dolu mu?
- [ ] `position.responsibilities` en az 1 eleman içeriyor mu?
- [ ] `position.requirements` en az 1 eleman içeriyor mu?
- [ ] `interview_topics` en az 1 eleman içeriyor mu?
- [ ] Her topic'in `category` değeri geçerli enum mu? (küçük harf)
- [ ] Her topic'in `topic` alanı dolu mu?
- [ ] `scoring` varsa, tüm alt alanları (`scale`, `minimum_expected`, `importance`) dolu mu?
- [ ] `importance` değeri 1, 2, 3, 4 veya 5 mi? (integer, string değil)
- [ ] `candidate.name` dolu mu?
- [ ] `experiences` varsa, her birinde `title`, `company`, `duration` dolu mu?
- [ ] `education` varsa, her birinde `degree`, `school`, `duration` dolu mu?

---

## 📝 Response Formatı

### Başarılı (201 Created)

```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "joinUrl": "https://interview.example.com/interview/550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "createdAt": "2026-02-04T10:00:00Z"
  }
}
```

### Authentication Hatası (401 Unauthorized)

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing API key"
  }
}
```

### Rate Limit Hatası (429 Too Many Requests)

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests"
  }
}
```

### Validation Hatası (400 Bad Request)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "interview_topics.0.category: Invalid enum value. Expected 'technical' | 'behavioral' | 'experience' | 'motivation' | 'soft_skills', received 'tech'"
  }
}
```

---

## 📚 İlgili Dokümanlar

- [API Design](../plans/03-api-design.md) - Tüm API endpoint'leri
- [ATS Request Sample](../samples/ATS-Request-Sample.json) - Tam örnek request

---

*Bu kılavuz AI Interview projesi için harici entegrasyonlara yöneliktir.*
