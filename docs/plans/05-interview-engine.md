# BÖLÜM 5: GÖRÜŞME ENGINE DETAYI

> **Versiyon:** 1.0  
> **Son Güncelleme:** 2026-01-23  
> **Durum:** ✅ Onaylandı

---

## 5.1 Temel Prensipler

### Yaklaşım Felsefesi

**"Gerçek bir recruiter gibi davran"**

- Teknik sorulara aşırı önem verme (AI çağında kolayca cevaplanabilir)
- Pozisyona uygunluk ve geçmiş deneyimlere odaklan
- Doğal, akıcı bir sohbet yürüt
- İyi/kötü cevap yargılaması yapma, sadece sonraki adımı belirle
- Takip sorusu sadece gerçekten gerektiğinde

### Kısıtlamalar

| Parametre | Değer | Not |
|-----------|-------|-----|
| Max süre | 30 dakika | Configurable |
| Varsayılan dil | Türkçe | EN desteği eklenebilir |
| Takip sorusu | Claude karar verir | Çoğunlukla sormasın |

---

## 5.2 Görüşme Fazları

```
┌─────────────┐    ┌────────────┐    ┌───────────┐    ┌────────────┐    ┌────────────┐    ┌─────────┐
│INTRODUCTION │───►│ EXPERIENCE │───►│ TECHNICAL │───►│ BEHAVIORAL │───►│ MOTIVATION │───►│ CLOSING │
└─────────────┘    └────────────┘    └───────────┘    └────────────┘    └────────────┘    └─────────┘
    ~2 dk             ~8 dk            ~8 dk             ~6 dk             ~4 dk           ~2 dk

Toplam: ~30 dakika
```

### Faz Detayları

| Faz | Süre | Amaç | Odak |
|-----|------|------|------|
| `introduction` | ~2 dk | Tanışma, görüşme kuralları | Rahatlatma, beklenti belirleme |
| `experience` | ~8 dk | CV'deki deneyimleri anlama | Pozisyona uygun deneyimler |
| `technical` | ~8 dk | Temel teknik yetkinlik | Derinlemesine değil, genel anlayış |
| `behavioral` | ~6 dk | Çalışma tarzı, soft skills | Takım uyumu, problem çözme |
| `motivation` | ~4 dk | Motivasyon, kariyer hedefleri | Pozisyona ilgi, uzun vadeli uyum |
| `closing` | ~2 dk | Kapanış | Aday soruları, teşekkür |

---

## 5.3 Claude System Prompt

### Prompt Yapısı

```
Sen {company} şirketinde {position} pozisyonu için görüşme yapan deneyimli bir İK uzmanısın.

## ADAY BİLGİLERİ
Ad: {candidateName}
Deneyimler: {experiences}
Eğitim: {education}
Yetenekler: {skills}

## POZİSYON BİLGİLERİ
Şirket: {companyName} ({industry}, {size})
Pozisyon: {positionTitle}
Sorumluluklar: {responsibilities}
Gereksinimler: {requirements}

## DEĞERLENDİRİLECEK KONULAR
{topics - her biri category, topic, description, evaluation_guide ile}

## GÖRÜŞME KURALLARI

1. DOĞAL OL
   - Gerçek bir recruiter gibi davran
   - Samimi ama profesyonel ol
   - Robotik cevaplardan kaçın

2. TEKNİK SORULARA TAKILMA
   - Günümüzde teknik sorular AI ile kolayca cevaplanabiliyor
   - Teknik derinliğe inmek yerine genel anlayışı ölç
   - Pozisyona uygunluk ve deneyime odaklan

3. TAKİP SORUSU POLİTİKASI
   - Çoğu zaman takip sorusu sorma, direkt sonraki konuya geç
   - Sadece gerçekten belirsiz veya kritik bir nokta varsa derinleştir
   - Aday geçmek istiyorsa üsteleme

4. ZAMAN YÖNETİMİ
   - Toplam görüşme süresi: {maxDurationMinutes} dakika
   - Her fazda öngörülen süreyi aşma
   - Kalan süreye göre soruları ayarla

5. DİL
   - Görüşme dili: {language}
   - Tutarlı ol, dil değiştirme

## RESPONSE FORMAT

Her yanıtında şu JSON formatını kullan:

{
  "action": "ask_question" | "change_phase" | "end_interview",
  "question": "Soracağın soru (action=ask_question ise) - MAKSIMUM 2-3 cümle!",
  "nextPhase": "Geçilecek faz (action=change_phase ise)",
  "topic": "Sorunun ilgili olduğu konu (varsa)",
  "isFollowUp": true | false,
  "note": "Internal not (adayın geçmek istediği, belirsiz cevap vs.)",
  "reasoning": "Neden bu soruyu sordun? CV'deki hangi bilgiye dayanıyor?",
  "turn": "ai | candidate"
}

### Turn Yönetimi

- `turn: "candidate"`: Soru sordun, aday cevap verecek. Frontend mikrofonu açar.
- `turn: "ai"`: Kısa yorum/geçiş cümlesi söyledin, AI devam edecek. Mikrofon KAPALI kalır.

**Çoğu durumda `turn: "candidate"` olmalı.** `turn: "ai"` sadece çok kısa geçiş cümlelerinde kullanılır.
```

---

## 5.4 Her Tur Conversation Flow

### Claude'a Gönderilecek Mesaj

```
## MEVCUT DURUM
- Faz: {currentPhase}
- Geçen süre: {elapsedMinutes} dk / {maxDurationMinutes} dk
- Bu fazda soru sayısı: {phaseQuestionCount}

## SON KONUŞMA
AI: "{lastAIMessage}"
Aday: "{lastCandidateMessage}"

## GÖREV
Doğal bir recruiter olarak sonraki adımı belirle. 
Cevabı değerlendirme, sadece sohbeti ilerlet.
```

### Claude Response Örnekleri

**Normal soru geçişi:**
```json
{
  "action": "ask_question",
  "question": "TechMart'taki e-ticaret projesinde en çok hangi teknik zorluklarla karşılaştın?",
  "topic": "E-ticaret/Ölçek Deneyimi",
  "isFollowUp": false,
  "note": null
}
```

**Takip sorusu (nadir):**
```json
{
  "action": "ask_question",
  "question": "Mikro-frontend geçişinde ekip olarak nasıl bir yol izlediniz?",
  "topic": "Teknik Liderlik",
  "isFollowUp": true,
  "note": "Aday liderlik rolünü yüzeysel geçti, biraz derinleştiriyorum"
}
```

**Faz geçişi:**
```json
{
  "action": "change_phase",
  "nextPhase": "technical",
  "question": "Şimdi biraz teknik konulara geçelim. React ile çalışırken en çok hangi pattern'ları kullanıyorsun?",
  "topic": "React",
  "isFollowUp": false,
  "note": null
}
```

**Aday geçmek istediğinde:**
```json
{
  "action": "ask_question",
  "question": "Tabii, o zaman şöyle bir soru sorayım: State management konusunda hangi yaklaşımları tercih ediyorsun?",
  "topic": "State Management",
  "isFollowUp": false,
  "note": "Aday önceki soruyu geçmek istedi, not edildi"
}
```

**Görüşme bitişi:**
```json
{
  "action": "end_interview",
  "question": "Görüşmemiz sona erdi. Zaman ayırdığın için çok teşekkür ederim. En kısa sürede sana dönüş yapacağız.",
  "note": null
}
```

---

## 5.5 Conversation State Machine

```
                              ┌─────────────────┐
                              │     IDLE        │
                              │  (WS bekleniyor)│
                              └────────┬────────┘
                                       │ WS connected
                                       ▼
                              ┌─────────────────┐
                              │    READY        │
                              │ (interview:start│
                              │   bekleniyor)   │
                              └────────┬────────┘
                                       │ interview:start
                                       ▼
         ┌────────────────────────────────────────────────────┐
         │                 INTERVIEW LOOP                      │
         │                                                     │
         │  ┌──────────────────────────────────────────────┐  │
         │  │              AI_GENERATING                    │  │
         │  │  • Claude'a request gönder                    │  │
         │  │  • Soru/aksiyon al                            │  │
         │  └─────────────────────┬────────────────────────┘  │
         │                        │                            │
         │                        ▼                            │
         │  ┌──────────────────────────────────────────────┐  │
         │  │              AI_SPEAKING                      │  │
         │  │  • TTS'e text gönder                         │  │
         │  │  • Audio stream + Avatar                      │  │
         │  │  • Transcript'e kaydet                        │  │
         │  └─────────────────────┬────────────────────────┘  │
         │                        │                            │
         │                        ▼                            │
         │  ┌──────────────────────────────────────────────┐  │
         │  │           WAITING_FOR_CANDIDATE              │  │
         │  │  • Aday cevabı bekleniyor                    │  │
         │  │  • candidate:speaking:start bekle            │  │
         │  └─────────────────────┬────────────────────────┘  │
         │                        │                            │
         │                        ▼                            │
         │  ┌──────────────────────────────────────────────┐  │
         │  │           CANDIDATE_SPEAKING                 │  │
         │  │  • Whisper STT aktif                          │  │
         │  │  • Partial transcript alınıyor               │  │
         │  │  • VAD ile bitiş algılama                    │  │
         │  └─────────────────────┬────────────────────────┘  │
         │                        │                            │
         │                        ▼                            │
         │  ┌──────────────────────────────────────────────┐  │
         │  │              PROCESSING                       │  │
         │  │  • Final transcript kaydet                   │  │
         │  │  • Claude'a gönder (sonraki adım için)       │──┼──► Döngü
         │  └──────────────────────────────────────────────┘  │
         │                                                     │
         └─────────────────────────────────────────────────────┘
                                       │
                                       │ action: end_interview
                                       ▼
                              ┌─────────────────┐
                              │   COMPLETED     │
                              │ (ATS callback)  │
                              └─────────────────┘
```

### State Transitions

| Mevcut State | Event | Sonraki State |
|--------------|-------|---------------|
| IDLE | WS connected | READY |
| READY | interview:start | AI_GENERATING |
| AI_GENERATING | Claude response | AI_SPEAKING |
| AI_SPEAKING | TTS complete | WAITING_FOR_CANDIDATE |
| AI_SPEAKING | candidate:interrupt | WAITING_FOR_CANDIDATE |
| WAITING_FOR_CANDIDATE | candidate:speaking:start | CANDIDATE_SPEAKING |
| CANDIDATE_SPEAKING | VAD silence / speaking:end | PROCESSING |
| PROCESSING | action=ask_question | AI_GENERATING |
| PROCESSING | action=change_phase | AI_GENERATING |
| PROCESSING | action=end_interview | COMPLETED |

---

## 5.6 Faz Geçiş Mantığı

### Otomatik Geçiş Kuralları

Claude her turda mevcut durumu değerlendirir ve faz geçişine karar verir. Aşağıdaki soft kurallar system prompt'ta belirtilir:

| Faz | Yaklaşık Soru | Geçiş Sinyali |
|-----|---------------|---------------|
| `introduction` | 1-2 | Aday rahatladı, görüşme kuralları anlatıldı |
| `experience` | 3-5 | Önemli deneyimler konuşuldu |
| `technical` | 3-5 | Temel teknik anlayış ölçüldü |
| `behavioral` | 2-4 | Çalışma tarzı anlaşıldı |
| `motivation` | 2-3 | Motivasyon ve hedefler konuşuldu |
| `closing` | 1 | Aday soruları alındı |

### Zaman Bazlı Uyarı

```
Eğer elapsedMinutes > maxDurationMinutes * 0.8:
  → Claude'a "Süre azalıyor, görüşmeyi toparlayalım" hint'i ver
  
Eğer elapsedMinutes > maxDurationMinutes:
  → Zorla closing fazına geç
```

---

## 5.7 Interrupt Handling

### Aday AI'ı Kestiğinde

```
┌─────────────────────────────────────────────┐
│ AI konuşuyor (AI_SPEAKING state)            │
└─────────────────────┬───────────────────────┘
                      │
                      │ candidate:interrupt
                      ▼
┌─────────────────────────────────────────────┐
│ 1. TTS stream iptal                         │
│ 2. Avatar durur                             │
│ 3. AI: "Buyurun, sizi dinliyorum"           │
│ 4. State → WAITING_FOR_CANDIDATE            │
└─────────────────────────────────────────────┘
```

### Aday Soruyu Geçmek İstediğinde

Aday cevabında "geçelim", "bilmiyorum", "pas" gibi ifadeler kullanırsa:
- Claude bunu algılar
- Not olarak kaydeder ("Aday bu soruyu geçmek istedi")
- Üstelemeden sonraki soruya geçer

---

## 5.8 Dil Desteği

### Configuration

```typescript
interface InterviewConfig {
  language: 'tr' | 'en';  // Genişletilebilir
  maxDurationMinutes: number;
  // ...
}
```

### Dil Bazlı Prompt Ayarları

| Dil | System Prompt | TTS Voice | STT Model |
|-----|---------------|-----------|-----------|
| `tr` | Türkçe prompt | Türkçe ses | `nova-2` (TR) |
| `en` | English prompt | English voice | `nova-2` (EN) |

### ATS'den Gelen Veri

```json
{
  "config": {
    "language": "tr",
    "maxDurationMinutes": 30
  },
  "position": { ... },
  "candidate": { ... },
  "interview_topics": [ ... ]
}
```

**Not:** MVP'de varsayılan `tr`. Dil seçimi ATS tarafından belirlenir veya environment variable olarak set edilir.

---

## 5.9 Interview Engine Service Yapısı

```
interviewEngine/
├── index.ts              # Main service export
├── stateMachine.ts       # State management
├── claudeClient.ts       # Claude API wrapper
├── promptBuilder.ts      # System/user prompt generation
├── phaseManager.ts       # Phase transition logic
└── types.ts              # Engine-specific types
```

### Ana Fonksiyonlar

```typescript
// Interview başlat
startInterview(sessionId: string): Promise<void>

// Sonraki aksiyonu al (Claude'dan)
getNextAction(
  sessionId: string,
  candidateMessage: string
): Promise<InterviewAction>

// Interrupt handle
handleInterrupt(sessionId: string): Promise<string>

// State güncelle
updateState(sessionId: string, newState: InterviewState): void
```

---

## 5.10 Kesinleşen Kararlar

| Karar | Değer | Gerekçe |
|-------|-------|---------|
| Yaklaşım | Recruiter gibi davran | Doğal görüşme deneyimi |
| Teknik sorular | Derinlemesine değil | AI çağında geçerliliği azaldı |
| Takip sorusu | Claude karar verir (nadir) | Akıcı görüşme |
| Max süre | 30 dakika | Configurable |
| Interrupt | "Buyurun, sizi dinliyorum" | Doğal, saygılı |
| Dil | TR varsayılan, EN eklenebilir | Mimari dil-agnostik |
| Değerlendirme | Minimal (sadece akış için) | Token/zaman tasarrufu |

---

## 5.11 Örnek Görüşme Akışı

```
[INTRODUCTION - 2 dk]
AI: "Merhaba Ahmet, TechCorp'a hoş geldin. Ben senin görüşme asistanınım. 
     Bugün yaklaşık 30 dakikalık bir sohbetimiz olacak. Hazır mısın?"
Aday: "Merhaba, evet hazırım."
AI: "Harika! O zaman başlayalım."

[EXPERIENCE - 8 dk]
AI: "CV'ne baktım, TechMart'ta 2 yılı aşkın süredir çalışıyorsun. 
     Orada e-ticaret platformunda neler yapıyorsun?"
Aday: "2 milyondan fazla kullanıcısı olan bir platformda frontend geliştirme..."
AI: "Mikro-frontend geçişinden bahsetmişsin. Bu süreçte senin rolün neydi?"
Aday: "Ben migration planlamasında ve component library oluşturmada aktif rol aldım..."
AI: "Peki TechMart öncesinde FinApp'te neler yaptın?"
...

[TECHNICAL - 8 dk]
AI: "Şimdi biraz teknik konulara geçelim. React ile en çok hangi pattern'ları kullanıyorsun?"
Aday: "Custom hooks, compound components, render props..."
AI: "State management için hangi yaklaşımı tercih ediyorsun ve neden?"
Aday: "Projeye göre değişiyor ama genelde..."
...

[BEHAVIORAL - 6 dk]
AI: "Ekip içinde bir anlaşmazlık yaşadığında nasıl çözüyorsun?"
Aday: "Önce karşı tarafı dinlemeye çalışıyorum..."
AI: "Peki deadline baskısı altında nasıl çalışıyorsun?"
...

[MOTIVATION - 4 dk]
AI: "TechCorp'ta çalışmak seni neden heyecanlandırıyor?"
Aday: "E-ticaret sektöründeki deneyimim..."
AI: "5 yıl sonra kendini nerede görüyorsun?"
...

[CLOSING - 2 dk]
AI: "Görüşmemiz sona yaklaşıyor. Senin bana sormak istediğin sorular var mı?"
Aday: "Ekip yapısı nasıl?"
AI: "Harika bir soru. Ekip 8 kişilik, 3'ü senior... 
     Başka sorun var mı?"
Aday: "Hayır, teşekkürler."
AI: "Ben teşekkür ederim Ahmet. En kısa sürede sana dönüş yapacağız. İyi günler!"

[COMPLETED]
```

---

**Önceki Bölüm:** [04-project-structure.md](./04-project-structure.md)  
**Sonraki Bölüm:** [06-realtime-pipeline.md](./06-realtime-pipeline.md)
