# Değerlendirme Oturumu Oluşturma Kılavuzu

## Endpoint

```
POST /sessions
```

### Headers

```
Content-Type: application/json
X-API-Key: <api-key>
```

### Request Body

```json
{
  "assessment": {
    "title": "Mağaza Oryantasyon Değerlendirmesi",
    "introText": "Merhaba {candidateName}! Ben oryantasyon değerlendirme asistanınızım...",
    "closingText": "Tüm soruları tamamladık. Katılımınız için teşekkür ederim..."
  },
  "questions": [
    {
      "id": "q-1",
      "order": 1,
      "text": "Soru metni?",
      "category": "Kategori",
      "correctOnWrong": true,
      "correctAnswer": "Doğru cevap metni"
    }
  ],
  "candidate": {
    "name": "Ayşe Yılmaz",
    "email": "ayse@example.com",
    "personnelCode": "P-2024-001",
    "position": "Satış Danışmanı",
    "store": "İstanbul Kadıköy Mağazası"
  },
  "settings": {
    "cameraMonitoring": false,
    "maxDurationMinutes": 20,
    "language": "tr"
  },
  "externalId": "orient-2024-001",
  "callbackUrl": "https://your-app.com/api/callback"
}
```

### Response (201)

```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "joinUrl": "https://app.example.com/interview/{sessionId}",
    "status": "pending",
    "createdAt": "2026-04-01T00:00:00.000Z"
  }
}
```

## Alan Açıklamaları

### assessment (zorunlu)

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| title | string | ✅ | Değerlendirme başlığı |
| introText | string | ✅ | AI'ın giriş konuşması. `{candidateName}` placeholder kullanılabilir |
| closingText | string | ✅ | AI'ın kapanış konuşması |

### questions (zorunlu, min 1)

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| id | string | ✅ | Benzersiz soru ID'si |
| order | number | ✅ | Sıra numarası (1'den başlar) |
| text | string | ✅ | Soru metni |
| category | string | ✅ | Soru kategorisi |
| correctOnWrong | boolean | ✅ | `true`: yanlış cevapta doğruyu söyler, `false`: sonraki soruya geçer |
| correctAnswer | string | ✅ | Doğru cevap (AI karşılaştırma için kullanır) |

### candidate (zorunlu)

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| name | string | ✅ | Çalışan adı |
| email | string | ❌ | E-posta |
| personnelCode | string | ❌ | Sicil no |
| position | string | ❌ | Pozisyon |
| store | string | ❌ | Mağaza |

### settings (opsiyonel)

| Alan | Tip | Varsayılan | Açıklama |
|------|-----|-----------|----------|
| cameraMonitoring | boolean | false | Kamera izleme |
| maxDurationMinutes | number | 45 | Maksimum süre |
| language | string | "tr" | Dil |

### Diğer Alanlar

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| externalId | string | ❌ | Harici referans ID |
| callbackUrl | string (URL) | ❌ | Tamamlanma callback URL'i |

## Callback (Transcript POST)

Değerlendirme tamamlandığında `callbackUrl`'e POST yapılır:

```json
{
  "sessionId": "uuid",
  "externalId": "orient-2024-001",
  "candidate": {
    "name": "Ayşe Yılmaz",
    "email": "ayse@example.com",
    "personnelCode": "P-2024-001",
    "position": "Satış Danışmanı",
    "store": "İstanbul Kadıköy Mağazası"
  },
  "assessment": {
    "title": "Mağaza Oryantasyon Değerlendirmesi"
  },
  "duration": {
    "startedAt": "2026-04-01T10:00:00.000Z",
    "endedAt": "2026-04-01T10:15:00.000Z",
    "totalMinutes": 15
  },
  "transcript": [
    {
      "speaker": "ai",
      "content": "Merhaba Ayşe! ...",
      "phase": "introduction",
      "questionContext": null,
      "timestampMs": 0
    },
    {
      "speaker": "candidate",
      "content": "Merhaba, hazırım.",
      "phase": "assessment",
      "questionContext": "q-1",
      "timestampMs": 15000
    }
  ]
}
```
