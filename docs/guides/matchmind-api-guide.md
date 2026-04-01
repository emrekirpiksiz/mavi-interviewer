# AI HR Portal - Interview Event API'leri Kılavuzu

> **Versiyon:** 1.0  
> **Son Güncelleme:** 2026-02-04  
> **Hedef Kitle:** Interview uygulaması geliştiricileri

---

## Genel Bilgiler

Bu kılavuz, AI Interview uygulamasının HR Portal'a geri bildirim göndermesi için kullanacağı webhook API'lerini tanımlar.

### Base URL

```
Production: https://[HR_PORTAL_URL]/api/ai-interviews
```

### Authentication

Tüm endpoint'ler **HTTP Basic Authentication** kullanır.

| Parametre | Değer |
|-----------|-------|
| Username | `interview_app` (veya tanımlanan INTERVIEW_WEBHOOK_USERNAME) |
| Password | Paylaşılan şifre (INTERVIEW_WEBHOOK_PASSWORD) |

**Header Formatı:**
```
Authorization: Basic base64(username:password)
```

**Örnek (username: interview_app, password: secret123):**
```bash
# Base64: interview_app:secret123 = aW50ZXJ2aWV3X2FwcDpzZWNyZXQxMjM=
Authorization: Basic aW50ZXJ2aWV3X2FwcDpzZWNyZXQxMjM=
```

**cURL ile Basic Auth:**
```bash
curl -u "interview_app:secret123" https://...
# veya
curl -H "Authorization: Basic aW50ZXJ2aWV3X2FwcDpzZWNyZXQxMjM=" https://...
```

---

## 1️⃣ Status Update Endpoint

Görüşme durumu değiştiğinde (başladı, tamamlandı, hata oluştu) çağrılır.

### Endpoint

```
POST /api/ai-interviews/status
Content-Type: application/json
```

### Request Body

```json
{
  "session_id": "string",       // ✅ ZORUNLU - Session oluşturulurken dönen sessionId
  "status": "enum",             // ✅ ZORUNLU - Yeni durum
  "duration_seconds": number    // opsiyonel - Görüşme süresi (saniye)
}
```

### `status` Alanı - Kabul Edilen Değerler

| Değer | Açıklama | Ne Zaman Gönderilir |
|-------|----------|---------------------|
| `in_progress` | Görüşme başladı | Aday görüşmeye katıldığında |
| `completed` | Görüşme tamamlandı | Görüşme normal şekilde bittiğinde |
| `technical_error` | Teknik hata | Bağlantı kopması, sistem hatası vb. |

### Örnek Request - Görüşme Başladı

```bash
curl -X POST "https://hr-portal.example.com/api/ai-interviews/status" \
  -u "interview_app:secret123" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "in_progress"
  }'
```

### Örnek Request - Görüşme Tamamlandı

```bash
curl -X POST "https://hr-portal.example.com/api/ai-interviews/status" \
  -u "interview_app:secret123" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "duration_seconds": 1847
  }'
```

### Örnek Request - Teknik Hata

```bash
curl -X POST "https://hr-portal.example.com/api/ai-interviews/status" \
  -u "interview_app:secret123" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "technical_error"
  }'
```

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "interview_id": "uuid-of-interview-record",
    "status": "completed"
  }
}
```

### Error Responses

**401 Unauthorized:**
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

**400 Bad Request (Validation Error):**
```json
{
  "success": false,
  "error": "Validation error",
  "details": [
    {
      "code": "invalid_enum_value",
      "path": ["status"],
      "message": "Invalid enum value. Expected 'in_progress' | 'completed' | 'technical_error'"
    }
  ]
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Interview not found"
}
```

---

## 2️⃣ Transaction Submit Endpoint

Görüşme tamamlandığında transcript (konuşma kaydı) gönderilir.

### Endpoint

```
POST /api/ai-interviews/transaction
Content-Type: application/json
```

### Request Body

```json
{
  "session_id": "string",          // ✅ ZORUNLU
  "transaction": {                 // ✅ ZORUNLU - Görüşme transcript'i
    "session": {
      "sessionId": "string",       // ✅ ZORUNLU
      "candidateName": "string",   // ✅ ZORUNLU
      "positionTitle": "string",   // ✅ ZORUNLU
      "companyName": "string",     // ✅ ZORUNLU
      "duration": "string"         // ✅ ZORUNLU - örn: "30:47"
    },
    "entries": [                   // ✅ ZORUNLU - min 1 eleman
      {
        "speaker": "enum",         // ✅ ZORUNLU - "ai" | "candidate"
        "content": "string",       // ✅ ZORUNLU - Konuşma içeriği
        "phase": "enum",           // ✅ ZORUNLU - Görüşme fazı
        "timestamp": "string"      // ✅ ZORUNLU - ISO 8601 formatı
      }
    ]
  }
}
```

### `speaker` Alanı

| Değer | Açıklama |
|-------|----------|
| `ai` | AI görüşmecinin konuşması |
| `candidate` | Adayın cevabı |

### `phase` Alanı

| Değer | Açıklama |
|-------|----------|
| `introduction` | Giriş/tanışma bölümü |
| `experience` | Deneyim soruları |
| `technical` | Teknik sorular |
| `soft_skills` | Soft skill soruları |
| `closing` | Kapanış bölümü |

### Tam Örnek Request

```bash
curl -X POST "https://hr-portal.example.com/api/ai-interviews/transaction" \
  -u "interview_app:secret123" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "transaction": {
      "session": {
        "sessionId": "550e8400-e29b-41d4-a716-446655440000",
        "candidateName": "Ahmet Yılmaz",
        "positionTitle": "Senior Frontend Developer",
        "companyName": "TechCorp",
        "duration": "28:15"
      },
      "entries": [
        {
          "speaker": "ai",
          "content": "Merhaba Ahmet, görüşmemize hoş geldiniz. Ben AI görüşmeciniz olacağım. Hazır olduğunuzda başlayabiliriz.",
          "phase": "introduction",
          "timestamp": "2026-02-04T10:00:00Z"
        },
        {
          "speaker": "candidate",
          "content": "Merhaba, teşekkür ederim. Evet, hazırım.",
          "phase": "introduction",
          "timestamp": "2026-02-04T10:00:15Z"
        },
        {
          "speaker": "ai",
          "content": "Harika. Öncelikle kendinizden ve son projelerinizden bahseder misiniz?",
          "phase": "experience",
          "timestamp": "2026-02-04T10:00:25Z"
        },
        {
          "speaker": "candidate",
          "content": "Tabii. Ben 5 yıldır frontend geliştirici olarak çalışıyorum. Son projemde React ve TypeScript kullanarak büyük ölçekli bir e-ticaret platformu geliştirdim. Özellikle performance optimizasyonu ve state management konularında deneyim kazandım.",
          "phase": "experience",
          "timestamp": "2026-02-04T10:00:40Z"
        },
        {
          "speaker": "ai",
          "content": "React Hooks konusunda deneyiminizi anlatır mısınız? Özellikle useCallback ve useMemo kullanımı hakkında ne düşünüyorsunuz?",
          "phase": "technical",
          "timestamp": "2026-02-04T10:05:00Z"
        },
        {
          "speaker": "candidate",
          "content": "useCallback ve useMemo performans optimizasyonu için kritik hook'\''lar. useCallback fonksiyon referanslarını stabilize etmek için, useMemo ise hesaplamalı değerleri cache'\''lemek için kullanıyorum. Özellikle child component'\''lara geçirilen callback'\''lerde gereksiz re-render'\''ları önlemek için useCallback kullanıyorum.",
          "phase": "technical",
          "timestamp": "2026-02-04T10:05:30Z"
        },
        {
          "speaker": "ai",
          "content": "Çok iyi açıkladınız. Son olarak, takım içi iletişimde karşılaştığınız bir zorluğu ve nasıl çözdüğünüzü paylaşır mısınız?",
          "phase": "soft_skills",
          "timestamp": "2026-02-04T10:15:00Z"
        },
        {
          "speaker": "candidate",
          "content": "Geçen projemizde backend takımıyla API kontratları konusunda anlaşmazlık yaşadık. Bir toplantı düzenleyerek herkesin ihtiyaçlarını dinledim ve ortak bir OpenAPI spec üzerinde anlaştık. Bu sayede iki takım da paralel çalışabildi.",
          "phase": "soft_skills",
          "timestamp": "2026-02-04T10:15:45Z"
        },
        {
          "speaker": "ai",
          "content": "Görüşmemiz burada sona eriyor. Katılımınız için teşekkür ederim Ahmet. İyi günler dilerim.",
          "phase": "closing",
          "timestamp": "2026-02-04T10:28:00Z"
        },
        {
          "speaker": "candidate",
          "content": "Ben teşekkür ederim, iyi günler.",
          "phase": "closing",
          "timestamp": "2026-02-04T10:28:10Z"
        }
      ]
    }
  }'
```

### Success Response (200 OK)

Eğer görüşme `completed` durumundaysa, transcript alındıktan sonra otomatik AI skorlaması tetiklenir.

```json
{
  "success": true,
  "data": {
    "interview_id": "uuid-of-interview-record",
    "scoring_status": "completed",
    "ai_score": 78
  }
}
```

**scoring_status Değerleri:**

| Değer | Açıklama |
|-------|----------|
| `pending` | Görüşme henüz completed değil, skorlama bekliyor |
| `completed` | Skorlama başarıyla tamamlandı |
| `failed` | Skorlama sırasında hata oluştu |

### Error Responses

**400 Bad Request (Validation Error):**
```json
{
  "success": false,
  "error": "Validation error",
  "details": [
    {
      "code": "too_small",
      "path": ["transaction", "entries"],
      "message": "Array must contain at least 1 element(s)"
    }
  ]
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Interview not found"
}
```

---

## 📋 Entegrasyon Akışı

Interview uygulamasının izlemesi gereken tipik akış:

```
1. Session oluşturulur (HR Portal → Interview App)
   ↓
2. Aday görüşmeye katılır
   ↓
3. POST /status → { status: "in_progress" }
   ↓
4. Görüşme devam eder (transcript kaydedilir)
   ↓
5. Görüşme biter
   ↓
6. POST /status → { status: "completed", duration_seconds: 1847 }
   ↓
7. POST /transaction → { session_id, transaction: {...} }
   ↓
8. HR Portal transcript'i alır ve AI skorlaması yapar
```

### Önemli Notlar

1. **Sıralama Önemli**: Status güncellemesi (`completed`) gönderildikten sonra transaction gönderilmelidir.

2. **Retry Mekanizması**: Network hatalarında retry yapılmalıdır:
   - 5xx hatalarında: 3 retry, exponential backoff (1s, 2s, 4s)
   - 4xx hatalarında: retry yapılmamalı (client hatası)

3. **Timeout**: Request timeout 30 saniye olarak ayarlanmalıdır.

4. **Idempotency**: Aynı session_id ile tekrar status update gönderilebilir (son durum geçerli olur).

---

## 🧪 Test Ortamı

Test için aşağıdaki endpoint'ler kullanılabilir:

```
Staging: https://staging-hr-portal.example.com/api/ai-interviews
```

Test credentials:
```
Username: interview_app
Password: (staging için paylaşılan şifre)
```

---

## 🔧 Debug Checklist

Request başarısız olduğunda kontrol edilecekler:

- [ ] Authorization header doğru formatta mı? (`Basic base64(user:pass)`)
- [ ] `session_id` session oluşturulurken dönen değer mi?
- [ ] `status` değeri geçerli enum mu? (`in_progress`, `completed`, `technical_error`)
- [ ] Transaction gönderilmeden önce status `completed` olarak güncellendi mi?
- [ ] `transaction.entries` en az 1 eleman içeriyor mu?
- [ ] Tüm `phase` değerleri geçerli mi? (`introduction`, `experience`, `technical`, `soft_skills`, `closing`)
- [ ] Tüm `speaker` değerleri geçerli mi? (`ai`, `candidate`)

---

## 📚 İlgili Dokümanlar

- [Session Oluşturma Kılavuzu](./create-session-guide.md) - Session oluşturma API'si
- [ATS Request Sample](../samples/ATS-Request-Sample.json) - Örnek ATS request JSON

---

*Bu kılavuz AI HR Portal projesi için Interview uygulaması entegrasyonuna yöneliktir.*
