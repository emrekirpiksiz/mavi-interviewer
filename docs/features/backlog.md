# Feature Backlog

> MVP sonrası eklenebilecek özelliklerin önceliklendirilmiş listesi.
> Her madde plan dokümanlarından (01, 08) taşınmıştır.

---

## Yüksek Öncelik

| # | Özellik | Kaynak | Açıklama |
|---|---------|--------|----------|
| 1 | Session expiry mekanizması | 01, 08 | Belirli süre sonra session'ın otomatik expire olması |

---

## Orta Öncelik

| # | Özellik | Kaynak | Açıklama |
|---|---------|--------|----------|
| 6 | Redis cache layer | 01 | Session cache, performans iyileştirmesi |
| 8 | STT provider alternatif değerlendirmesi | 01 | Whisper alternatifleri (Deepgram, AssemblyAI vb.) |

---

## Düşük Öncelik

| # | Özellik | Kaynak | Açıklama |
|---|---------|--------|----------|
| 9 | Video görüşme desteği | 01 | Sesli görüşmeden video görüşmeye geçiş |
| 10 | Avatar customization | 01 | Farklı avatar seçenekleri, özelleştirme |
| 11 | Multi-tenant | 01 | Birden fazla şirket desteği |
| 12 | User authentication | 08 | Kullanıcı giriş sistemi (opsiyonel) |

---

## Planlanan (Implementation Bekliyor)

_Şu an planlanan feature yok._

---

## Tamamlanan

| # | Özellik | Plan Dokümanı | Tarih |
|---|---------|---------------|-------|
| 8 | Kısıtlamalar & UX Optimizasyonları | [restrictions-optimizations.md](./restrictions-optimizations.md) | 2026-03-05 |
| 7 | Interview Ses Kaydı (Audio Recording) | [record-interview.md](./record-interview.md) | 2026-02-17 |
| 4+5 | Security Hardening (Rate Limiting + API Key Auth) | [security-hardening.md](./security-hardening.md) | 2026-02-07 |
| 2+3 | Session Resilience (Reconnect + Hata Yönetimi) | [session-resilience.md](./session-resilience.md) | 2026-02-07 |

---

*Son güncelleme: 2026-03-05*
*Kısıtlamalar & UX Optimizasyonları tamamlandı: 2026-03-05*
