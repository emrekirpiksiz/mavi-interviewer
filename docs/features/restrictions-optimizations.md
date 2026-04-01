# Feature: Kısıtlamalar & UX Optimizasyonları

> **Öncelik:** Yüksek  
> **Tahmini Effort:** M  
> **Bağımlılıklar:** Yok (mevcut yapı üzerine)  
> **Tarih:** 2026-03-05

---

## Problem / Motivasyon

Mevcut sistemde aşağıdaki UX sorunları tespit edilmiştir:

1. **Tarayıcı Uyumsuzlukları:** Sistem yoğun şekilde Web Audio API, WebRTC (Simli), MediaRecorder ve Web Speech API kullanmaktadır. Bu API'ler farklı tarayıcılarda farklı davranmakta, özellikle Safari ve Firefox'ta ciddi sorunlar yaşanmaktadır. Kullanıcılar desteklenmeyen tarayıcılarla girip hata aldığında deneyim bozulmaktadır.

2. **Mobil Deneyim:** Mobil cihazlarda WebRTC bağlantıları, ses kayıt akışı ve ekran düzeni optimal çalışmamaktadır. Şu an sadece web/desktop deneyimi güvenilirdir.

3. **Interrupt Butonu Karışıklığı:** ControlBar'daki interrupt (el ikonu) butonu AI konuşurken ortada aktif hale gelmektedir. Bu buton kullanıcılar tarafından "duraklat" olarak algılanmakta ve yanlışlıkla tıklanarak görüşme akışını bozmaktadır.

4. **Sıra Belirsizliği:** Görüşme sıra tabanlı (turn-based) çalışmasına rağmen, kullanıcılar sıranın kimde olduğunu ve ne yapmaları gerektiğini yeterince net anlayamamaktadır. Özellikle mikrofon açıldıktan sonra "konuşmam bittikten sonra ne yapmalıyım?" sorusu yaşanmaktadır.

5. **Mikrofon Akışı:** Mikrofon izni ve görüşme başlangıcı arasında net bir adım adım akış gereklidir. Her adım kontrollü ilerlemeli, kullanıcı hazır olmadan görüşme başlamamalıdır.

---

## Çözüm Yaklaşımı

### 1. Tarayıcı & Cihaz Kısıtlaması (Chrome-only + Desktop-only Gate)

**Yaklaşım:** Giriş sayfası (`page.tsx`) ve interview sayfası yüklenirken tarayıcı ve cihaz tespiti yapılacak. Desteklenmeyen ortamlarda kullanıcıya bilgilendirici bir uyarı ekranı gösterilecek.

#### 1.1 Tespit Mekanizması

Yeni bir utility fonksiyonu oluşturulacak: `apps/web/src/lib/browserCheck.ts`

```typescript
interface BrowserCheckResult {
  isSupported: boolean;
  isMobile: boolean;
  isChrome: boolean;
  browserName: string;
  issues: string[];
}

function checkBrowserCompatibility(): BrowserCheckResult {
  const ua = navigator.userAgent;
  
  // Mobil tespit
  const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua);
  
  // Chrome tespit (Chromium-based: Chrome, Edge, Opera da kabul edilebilir ama sadece Chrome garantili)
  // Not: Edge ve Opera da Chromium tabanlı ama "Chrome" olarak raporlanır
  const isChrome = /Chrome\/\d+/.test(ua) && !/Edg|OPR|Brave/i.test(ua);
  
  // Tarayıcı adı
  const browserName = detectBrowserName(ua);
  
  const issues: string[] = [];
  if (isMobile) issues.push('mobile');
  if (!isChrome) issues.push('non-chrome');
  
  return {
    isSupported: isChrome && !isMobile,
    isMobile,
    isChrome,
    browserName,
    issues,
  };
}
```

#### 1.2 Giriş Sayfasında Uyarı (`page.tsx`)

Mevcut giriş sayfasında (erişim kodu formu) sayfa yüklendiğinde tarayıcı kontrolü yapılacak. Eğer desteklenmeyen bir ortam tespit edilirse:

- Form devre dışı bırakılmayacak (kullanıcı yine de deneyebilir)
- Formun üstüne dikkat çekici bir uyarı banner'ı gösterilecek
- Uyarı mesajı duruma göre özelleştirilecek:

**Mobil cihaz ise:**
> "Bu görüşme şu anda yalnızca masaüstü bilgisayarlarda Google Chrome tarayıcısı ile desteklenmektedir. Lütfen bilgisayarınızdan Chrome tarayıcısı ile tekrar deneyin. Mobil cihaz desteği üzerinde çalışıyoruz."

**Farklı tarayıcı ise (Firefox, Safari, Edge vb.):**
> "Bu görüşme şu anda yalnızca Google Chrome tarayıcısı ile desteklenmektedir. Lütfen Chrome tarayıcısı ile tekrar deneyin. Diğer tarayıcı desteği için testlerimiz devam etmektedir."

**Her iki durum da varsa (mobil + farklı tarayıcı):**
> "Bu görüşme şu anda yalnızca masaüstü bilgisayarlarda Google Chrome tarayıcısı ile desteklenmektedir. Lütfen bilgisayarınızdan Chrome ile tekrar deneyin."

#### 1.3 Interview Sayfasında Kontrol

Interview sayfası (`/interview/[sessionId]`) yüklendiğinde de aynı kontrol yapılacak. Desteklenmeyen ortamlarda özel bir `UnsupportedBrowserScreen` bileşeni gösterilecek.

#### 1.4 UI Tasarımı

Uyarı bileşeni şu elementleri içerecek:
- Chrome ikonu/logosu
- Masaüstü bilgisayar ikonu
- Net ve anlaşılır mesaj (Türkçe)
- "Diğer tarayıcılar için testlerimiz devam etmektedir" bilgisi
- Chrome indirme linki (opsiyonel)

---

### 2. Interrupt (Duraklat) Butonunun Kaldırılması

**Mevcut Durum:** `ControlBar.tsx` içinde 3 buton var:
1. Mikrofon (sol) - `onMicToggle`
2. Interrupt / El ikonu (orta) - `onInterrupt` — AI konuşurken aktif
3. Görüşmeyi Bitir (sağ) - `onEndCall`

**Değişiklik:** Ortadaki interrupt (Hand) butonu tamamen kaldırılacak.

**Neden:** 
- Sıra tabanlı sistemde AI konuşurken kullanıcının kesme ihtiyacı minimal
- Buton "duraklat" olarak algılanıyor ve karışıklık yaratıyor
- AI konuşmasını kesmek flow'u bozuyor

**Etkilenen Dosyalar:**
- `apps/web/src/components/interview/ControlBar.tsx` — Interrupt butonu ve ilgili props kaldırılacak
- `apps/web/src/components/interview/ActiveScreen.tsx` — `onInterrupt` prop'u kaldırılacak
- `apps/web/src/app/interview/[sessionId]/page.tsx` — `interview.interrupt` referansı kaldırılacak
- `apps/web/src/hooks/useInterview.ts` — `interrupt` fonksiyonu korunacak (backend'de hâlâ destekleniyor, ileride tekrar eklenebilir) ama UI'dan kaldırılacak

**ControlBar Yeni Layout:**
```
[ Mikrofon (büyük) ]     [ Görüşmeyi Bitir ]
```

Sadece 2 buton kalacak. Mikrofon butonu ana işlem olduğu için daha büyük ve belirgin olacak.

---

### 3. Geliştirilmiş Sıra Göstergesi (Turn Indicator)

**Mevcut Durum:** `ActiveScreen.tsx`'te avatar altında küçük bir status indicator var:
- "AI KONUŞUYOR" (mavi)
- "İŞLENİYOR" (sarı)
- "DİNLENİYOR" (kırmızı)
- "SIRA SİZDE" (yeşil)

**Sorun:** Bu göstergeler yeterince dikkat çekici değil ve kullanıcı ne yapması gerektiğini her zaman anlayamıyor.

#### 3.1 Tam Ekran Sıra Overlay'i

Sıra değişimlerinde (özellikle AI → Aday geçişinde) kısa süreli büyük bir overlay gösterilecek:

**"SIRA SİZDE" durumu — Tam ekran overlay (2-3 saniye, sonra küçük indicator'a dönüşür):**

```
┌──────────────────────────────────────┐
│                                      │
│         🎤 SIRA SİZDE               │
│                                      │
│    Konuşabilirsiniz.                 │
│                                      │
│    Konuşmanız bittiğinde             │
│    Gönder butonuna basın.            │
│                                      │
└──────────────────────────────────────┘
```

Overlay animasyonlu olarak görünecek (fade-in + scale), 2-3 saniye sonra otomatik olarak kaybolacak ve mevcut küçük indicator aktif kalacak.

**"SIRA AI'DA" durumu:**

```
┌──────────────────────────────────────┐
│                                      │
│         🤖 SIRA AI'DA               │
│                                      │
│    Lütfen dinleyin...                │
│                                      │
└──────────────────────────────────────┘
```

Bu overlay daha kısa sürecek (1-2 saniye) ve AI konuşmaya başladığında kaybolacak.

#### 3.2 Mikrofon Butonu "Gönder" Moduna Dönüşümü

Mevcut durumda mikrofon butonu kayıt yaparken kırmızı renkte ve "Kaydı Durdur" title'ı var. Bu yeterince açık değil.

**Değişiklik:** Kayıt yaparken mikrofon butonu "Gönder" butonuna dönüşecek:

| Durum | Buton Görünümü | Metin | Renk |
|-------|---------------|-------|------|
| Sıra AI'da | MicOff ikonu | — | Gri, disabled |
| Sıra sizde (bekliyor) | Mic ikonu | "Konuşmaya Başla" | Yeşil, parlayan |
| Kayıt yapılıyor | Send/Arrow ikonu | "Gönder" | Kırmızı, animasyonlu |
| İşleniyor | Spinner | "İşleniyor..." | Sarı |

Bu sayede:
1. Kullanıcı mikrofonun açık olduğunu net görür
2. "Gönder" ifadesi ile konuşma bittiğinde ne yapması gerektiğini bilir
3. Kayıt sırasında süre göstergesi de devam eder

#### 3.3 Alt Bilgi Metni İyileştirmesi

ControlBar altındaki yardım metni daha net olacak:

| Durum | Mevcut Metin | Yeni Metin |
|-------|-------------|------------|
| AI konuşuyor | "AI konuşuyor. Kesmek için ortadaki butona tıklayın." | "AI konuşuyor. Lütfen dinleyin..." |
| Sıra sizde | "Sıra sizde! Mikrofon butonuna tıklayın." | "Sıra sizde! Mikrofon butonuna basıp konuşmaya başlayın." |
| Kayıt yapılıyor | "Kaydediliyor. Bitince mikrofon butonuna tıklayın." | "Konuşmanız kaydediliyor. Bitirdiğinizde Gönder butonuna basın." |
| İşleniyor | "Konuşmanız Whisper ile işleniyor..." | "Yanıtınız işleniyor, lütfen bekleyin..." |

---

### 4. Mikrofon Öncelikli Adım Adım Akış Optimizasyonu

**Mevcut Akış:**
```
Sayfa Yüklenme → WS Bağlantısı → ReadyScreen (otomatik mic request + kontroller) → Görüşmeye Başla → ActiveScreen → Simli Init → interview:start
```

**Sorun:** Mikrofon izni otomatik olarak isteniyor ve bazı tarayıcılarda bu talep göz ardı edilebiliyor. Ayrıca tüm kontroller tek bir ekranda yığılmış durumda.

**Optimize Edilmiş Akış:**

```
Sayfa Yüklenme
  ↓
Tarayıcı Kontrolü (Desteklenmiyor → UnsupportedBrowserScreen)
  ↓
WS Bağlantısı
  ↓
ReadyScreen - Adım 1: Bilgilendirme
  • Pozisyon bilgileri
  • AI görüşme hakkında bilgi
  • Sıra tabanlı sistem açıklaması (YENİ)
  ↓
ReadyScreen - Adım 2: Mikrofon İzni
  • Kullanıcı "Mikrofon İzni Ver" butonuna tıklar
  • İzin verilmezse → uyarı + tekrar dene
  ↓
ReadyScreen - Adım 3: Sistem Kontrolleri
  • Mikrofon ✓
  • Ses çıkışı ✓
  • İnternet bağlantısı ✓
  • Sunucu bağlantısı ✓
  ↓
ReadyScreen - Adım 4: KVKK Onayı
  ↓
"Görüşmeye Başla" Butonu (tüm koşullar sağlandığında aktif)
  ↓
ActiveScreen → Simli Init → interview:start
  ↓
AI selamlama (turn: 'ai') → AI ilk soru (turn: 'candidate')
  ↓
"SIRA SİZDE" overlay → Aday konuşur → "Gönder" butonuna basar
  ↓
Döngü devam eder...
```

#### 4.1 ReadyScreen'e "Nasıl Çalışır?" Bilgi Bölümü Eklenmesi

Mevcut "AI Görüşme Hakkında" bölümüne sıra tabanlı sistem hakkında özel bir açıklama eklenecek:

```
🔄 Görüşme Nasıl İlerler?

1. AI mülakatçı size soru soracak → "SIRA AI'DA" göstergesi
2. Soru bittikten sonra mikrofon aktif olacak → "SIRA SİZDE" göstergesi  
3. Konuşmanızı bitirdikten sonra "Gönder" butonuna basın
4. AI yanıtınızı değerlendirip yeni soru soracak
5. Bu döngü görüşme sonuna kadar devam eder

💡 İpucu: Mikrofon sadece sıra sizdeyken aktif olur. 
   AI konuşurken beklemeniz yeterlidir.
```

#### 4.2 Mikrofon İzni Akışının Netleştirilmesi

Mevcut durumda mikrofon izni `useEffect` ile otomatik isteniyor. Bunun yerine:

1. ReadyScreen yüklendiğinde mikrofon izni durumu kontrol edilecek
2. Eğer `pending` ise, kullanıcıya açık bir buton gösterilecek: "Mikrofon İzni Ver"
3. Buton tıklandığında `getUserMedia` çağrılacak
4. İzin verilene kadar sonraki adımlara geçilemeyecek

Bu değişiklik mevcut `handleMicRequest` fonksiyonunu user-initiated yaparak tarayıcı uyumluluğunu artıracak.

---

## Etkilenen Dosyalar

### Yeni Dosyalar
| Dosya | Açıklama |
|-------|----------|
| `apps/web/src/lib/browserCheck.ts` | Tarayıcı ve cihaz tespit utility fonksiyonları |
| `apps/web/src/components/interview/UnsupportedBrowserScreen.tsx` | Desteklenmeyen tarayıcı/cihaz uyarı ekranı |
| `apps/web/src/components/interview/TurnOverlay.tsx` | Sıra değişim overlay bileşeni |

### Değiştirilecek Dosyalar
| Dosya | Değişiklik |
|-------|-----------|
| `apps/web/src/app/page.tsx` | Tarayıcı kontrolü + uyarı banner eklenmesi |
| `apps/web/src/app/interview/[sessionId]/page.tsx` | Tarayıcı kontrolü + UnsupportedBrowserScreen, interrupt prop'unun kaldırılması |
| `apps/web/src/components/interview/ControlBar.tsx` | Interrupt butonu kaldırma, mic butonunun "Gönder" moduna dönüşümü, help text güncelleme |
| `apps/web/src/components/interview/ActiveScreen.tsx` | onInterrupt prop kaldırma, TurnOverlay entegrasyonu, status indicator iyileştirme |
| `apps/web/src/components/interview/ReadyScreen.tsx` | Sıra tabanlı sistem açıklaması, mikrofon akışı iyileştirmesi, tarayıcı bilgi notu |

### Değiştirilmeyecek (Korunacak) Dosyalar
| Dosya | Neden |
|-------|-------|
| `apps/web/src/hooks/useInterview.ts` | `interrupt` fonksiyonu korunur (backend uyumluluğu), sadece UI'dan kaldırılır |
| `apps/api/src/websocket/handlers.ts` | Backend interrupt handler korunur (breaking change yok) |
| `apps/web/src/stores/interviewStore.ts` | Store değişikliğe gerek yok, mevcut `currentTurn` ve `interviewState` yeterli |

---

## Detaylı Uygulama Planı

### Adım 1: Tarayıcı Tespit Utility'si
1. `apps/web/src/lib/browserCheck.ts` oluştur
2. `checkBrowserCompatibility()` fonksiyonunu yaz
3. Chrome, mobil, tarayıcı adı tespiti

### Adım 2: Giriş Sayfasına Uyarı Banner
1. `apps/web/src/app/page.tsx`'e tarayıcı kontrolü ekle
2. Koşullu uyarı banner bileşeni ekle
3. Formu devre dışı bırakma (sadece uyarı göster)

### Adım 3: Interview Sayfasına Gate
1. `UnsupportedBrowserScreen.tsx` bileşeni oluştur
2. `apps/web/src/app/interview/[sessionId]/page.tsx`'e tarayıcı kontrolü ekle
3. Desteklenmeyen ortamlarda bu ekranı göster

### Adım 4: Interrupt Butonu Kaldırma
1. `ControlBar.tsx`'ten interrupt butonunu ve ilgili props'u kaldır
2. `ActiveScreen.tsx`'ten `onInterrupt` prop'unu kaldır
3. `page.tsx`'ten `interview.interrupt` referansını kaldır
4. ControlBar layout'u güncelle (2 buton: Mic + End Call)

### Adım 5: Sıra Göstergesi Overlay
1. `TurnOverlay.tsx` bileşeni oluştur
2. "SIRA SİZDE" ve "SIRA AI'DA" overlay'lerini tasarla
3. `ActiveScreen.tsx`'e entegre et (state transition'larda göster)
4. Otomatik kapanma (2-3s) animasyonu ekle

### Adım 6: Mikrofon Butonu "Gönder" Modu
1. `ControlBar.tsx`'te kayıt durumunda buton görünümünü değiştir
2. Mic ikonu → Send/ArrowUp ikonu dönüşümü
3. "Kaydı Durdur" → "Gönder" metin değişikliği
4. Help text'leri güncelle

### Adım 7: ReadyScreen İyileştirmeleri
1. "Görüşme Nasıl İlerler?" bilgi bölümü ekle
2. Mikrofon izni butonunu explicit (kullanıcı tıklamalı) yap
3. Tarayıcı bilgi notu ekle ("Chrome tarayıcısı ile en iyi deneyim")

---

## Kabul Kriterleri

### Tarayıcı Kısıtlaması
- [ ] Chrome tarayıcısı ile giriş yapıldığında uyarı görünmez
- [ ] Safari/Firefox/Edge ile giriş yapıldığında uyarı banner görünür
- [ ] Mobil cihazdan giriş yapıldığında mobil uyarı görünür
- [ ] Uyarı mesajında "diğer tarayıcılar için testler devam ediyor" bilgisi var
- [ ] Interview sayfasında desteklenmeyen ortamda UnsupportedBrowserScreen gösterilir
- [ ] Giriş sayfasında form devre dışı bırakılmaz (uyarı bilgilendirme amaçlı)

### Interrupt Butonu
- [ ] ControlBar'da sadece 2 buton var: Mikrofon + Görüşmeyi Bitir
- [ ] Interrupt/Hand butonu UI'dan kaldırılmış
- [ ] Backend interrupt handler hâlâ çalışır (breaking change yok)
- [ ] ControlBar help text'te interrupt referansı yok

### Sıra Göstergesi
- [ ] AI → Aday geçişinde "SIRA SİZDE" overlay'i büyük yazı ile gösterilir
- [ ] Overlay'de "Konuşmanız bittiğinde Gönder butonuna basın" açıklaması var
- [ ] Aday → AI geçişinde "SIRA AI'DA" overlay'i gösterilir
- [ ] Overlay'ler 2-3 saniye sonra otomatik kaybolur
- [ ] Kayıt yaparken mikrofon butonu "Gönder" butonuna dönüşür (ikon + metin)
- [ ] Help text'ler güncel ve net

### Mikrofon Akışı
- [ ] Mikrofon izni açıkça kullanıcı tıklamasıyla istenir
- [ ] Mikrofon izni verilmeden "Görüşmeye Başla" butonu aktif olmaz
- [ ] ReadyScreen'de sıra tabanlı sistem açıklaması mevcut
- [ ] Adım adım akış tutarlı ve kullanıcı dostu

---

## UX Akış Diyagramı (Tamamlanmış Hali)

```
┌──────────────────────────────────────────────────────────────────┐
│                        GİRİŞ SAYFASI                              │
│                                                                  │
│  ┌─ Tarayıcı Kontrolü ──────────────────────────────────────┐   │
│  │ Chrome + Desktop? → Normal akış                           │   │
│  │ Diğer?            → Uyarı banner (bilgilendirme)         │   │
│  │ Mobil?             → Mobil uyarı banner                   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [ Erişim Kodu Formu ]                                          │
│                         ↓ POST /demo-session                     │
│                         ↓ Başarılı → /interview/{sessionId}      │
└──────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                     INTERVIEW SAYFASI                              │
│                                                                  │
│  ┌─ Tarayıcı Kontrolü (Gate) ───────────────────────────────┐   │
│  │ Desteklenmiyor → UnsupportedBrowserScreen (tam ekran)     │   │
│  │ Destekleniyor  → Normal akış devam                        │   │
│  └───────────────────────────────────────────────────────────┘   │
│                          │                                       │
│                          ▼                                       │
│  ┌─ LoadingScreen ───────────────────────────────────────────┐   │
│  │ Session kontrolü, WS bağlantısı                           │   │
│  └───────────────────────────────────────────────────────────┘   │
│                          │                                       │
│                          ▼                                       │
│  ┌─ ReadyScreen ─────────────────────────────────────────────┐   │
│  │                                                           │   │
│  │  📋 Pozisyon Bilgileri                                    │   │
│  │  ℹ️ AI Görüşme Hakkında                                   │   │
│  │  🔄 Görüşme Nasıl İlerler? (YENİ)                        │   │
│  │     → Sıra tabanlı sistem açıklaması                      │   │
│  │     → "Gönder" butonunu kullanma talimatı                 │   │
│  │                                                           │   │
│  │  🔒 Sistem Kontrolleri                                    │   │
│  │     🎤 Mikrofon: [ Mikrofon İzni Ver ] butonu             │   │
│  │     🔊 Ses Çıkışı: ✓                                     │   │
│  │     📶 İnternet: ✓                                        │   │
│  │     🔌 Sunucu: ✓                                          │   │
│  │                                                           │   │
│  │  📜 KVKK Onayı                                            │   │
│  │     [✓] Okudum, onaylıyorum                               │   │
│  │                                                           │   │
│  │  [ ▶ Görüşmeye Başla ]                                    │   │
│  └───────────────────────────────────────────────────────────┘   │
│                          │                                       │
│                          ▼                                       │
│  ┌─ ActiveScreen ────────────────────────────────────────────┐   │
│  │                                                           │   │
│  │  ┌──────────┐  ┌─────────────────────────────┐            │   │
│  │  │  Avatar  │  │   Görüşme Kaydı (Transcript)│            │   │
│  │  │          │  │                             │            │   │
│  │  │  [Phase] │  │   AI: Merhaba...            │            │   │
│  │  │          │  │   Siz: Yanıt...             │            │   │
│  │  │  ┌─────────────────────────────┐          │            │   │
│  │  │  │  🤖 SIRA AI'DA / Dinleyin  │          │            │   │
│  │  │  │       VEYA                  │          │            │   │
│  │  │  │  🎤 SIRA SİZDE             │          │            │   │
│  │  │  │  Konuşabilirsiniz.          │          │            │   │
│  │  │  │  Bitince "Gönder"e basın.   │          │            │   │
│  │  │  └─────────────────────────────┘          │            │   │
│  │  └──────────┘  └─────────────────────────────┘            │   │
│  │                                                           │   │
│  │  ControlBar (Yeni):                                       │   │
│  │  ┌────────────────────────────────────────────┐           │   │
│  │  │                                            │           │   │
│  │  │  [🎤 Konuşmaya Başla]   [📞 Bitir]        │           │   │
│  │  │       VEYA                                 │           │   │
│  │  │  [📤 Gönder (3s)]       [📞 Bitir]        │           │   │
│  │  │                                            │           │   │
│  │  │  💬 "Sıra sizde! Mikrofona basıp           │           │   │
│  │  │      konuşmaya başlayın."                  │           │   │
│  │  └────────────────────────────────────────────┘           │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Sıra Değişim Akışı (Detay)

```
AI konuşuyor (mavi indicator)
  │
  │ ai:speaking:end + turn: 'candidate'
  ▼
┌──────────────────────────────────┐
│    🎤 SIRA SİZDE                │  ← Büyük overlay (2-3 saniye)
│    Konuşabilirsiniz.             │
│    Bitirdiğinizde Gönder'e basın │
└──────────────────────────────────┘
  │ (2-3 saniye sonra overlay kaybolur)
  ▼
Küçük indicator: "🎤 SIRA SİZDE - Konuşmak için mikrofona basın"
  │
  │ Kullanıcı mikrofona basar
  ▼
Kayıt yapılıyor (kırmızı indicator + "DİNLENİYOR")
  │
  │ Mikrofon butonu → "📤 Gönder (5s)" görünümü
  │
  │ Kullanıcı "Gönder" butonuna basar
  ▼
İşleniyor (sarı indicator + spinner)
  │
  │ Whisper transcript → Backend'e gönder
  ▼
┌──────────────────────────────────┐
│    🤖 SIRA AI'DA                │  ← Kısa overlay (1-2 saniye)
│    Lütfen dinleyin...            │
└──────────────────────────────────┘
  │
  ▼
AI düşünüyor → AI konuşuyor (mavi indicator)
  │
  │ Döngü tekrar eder
  ▼
```

---

## Teknik Notlar

1. **Backend Değişikliği Yok:** Tüm değişiklikler frontend tarafındadır. Backend WebSocket event yapısı ve interview engine değişmez.

2. **Interrupt Korunur (Backend):** `candidate:interrupt` event handler'ı backend'de kalır. Gelecekte UI'a geri eklenebilir. `useInterview.ts`'teki `interrupt` fonksiyonu da korunur, sadece ControlBar'dan kaldırılır.

3. **Store Değişikliği Yok:** Mevcut `currentTurn`, `interviewState` ve `pageState` alanları zaten tüm gereksinimleri karşılamaktadır.

4. **Auto-start Recording Korunur:** `useInterview.ts`'teki otomatik kayıt başlatma mekanizması (interviewState === 'waiting_candidate' + currentTurn === 'candidate') korunur. TurnOverlay bu state transition'ı dinler.

5. **CSS Animasyonlar:** TurnOverlay için `animate-fadeIn`, `animate-scaleIn` gibi Tailwind custom animasyonlar gerekebilir. `tailwind.config.ts`'e eklenecek.

6. **Tarayıcı Tespit Güvenilirliği:** User-Agent sniffing %100 güvenilir değildir. Feature detection (WebRTC, MediaRecorder, AudioContext varlık kontrolü) ile desteklenebilir. Ancak MVP için UA tespiti yeterlidir.

---

## Notlar

- Bu feature tamamen frontend değişikliğidir, backend'e dokunulmaz.
- Giriş sayfasındaki tarayıcı uyarısı hard-block değil, soft-warning şeklindedir. Kullanıcı uyarıyı görmesine rağmen devam edebilir.
- Interview sayfasındaki kontrol ise daha katıdır — desteklenmeyen ortamda görüşme başlatılamaz.
- Interrupt butonu kaldırılması geri dönüşümlüdür. `useInterview.ts` ve backend'deki interrupt mantığı korunduğu için, gerekirse kolayca geri eklenebilir.
- TurnOverlay süresi ve animasyonları kullanıcı testleri ile fine-tune edilebilir.
