# Features - Gelecek Özellik Planları

> Bu klasör, mevcut MVP sonrasında eklenecek özelliklerin planlanması ve takibi için kullanılır.

---

## Süreç

1. **Backlog:** Tüm potansiyel özellikler `backlog.md` dosyasında toplanır
2. **Planlama:** Bir özellik implement edilmek üzere seçildiğinde, bu klasör altına ayrı bir `.md` dosyası oluşturulur (ör: `session-expiry.md`)
3. **Uygulama:** Plan onaylandıktan sonra implementation başlar
4. **Tamamlama:** Özellik tamamlandığında plan dosyası `[DONE]` ile işaretlenir

---

## Dosya Yapısı

```
docs/features/
├── README.md           # Bu dosya - süreç açıklaması
├── backlog.md          # Tüm potansiyel özelliklerin listesi
└── <feature-name>.md   # Onaylanmış özellik planları
```

---

## Feature Plan Şablonu

Yeni bir özellik planlanırken aşağıdaki şablon kullanılır:

```markdown
# Feature: [Özellik Adı]

> **Öncelik:** Yüksek / Orta / Düşük
> **Tahmini Effort:** S / M / L / XL
> **Bağımlılıklar:** [varsa listele]

## Problem / Motivasyon
Neden bu özelliğe ihtiyaç var?

## Çözüm Yaklaşımı
Nasıl implement edilecek?

## Etkilenen Dosyalar
- `dosya/yol.ts` - Değişiklik açıklaması

## Kabul Kriterleri
- [ ] Kriter 1
- [ ] Kriter 2

## Notlar
Ek bilgiler, kararlar, trade-off'lar.
```
