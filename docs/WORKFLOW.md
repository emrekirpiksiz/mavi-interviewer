# AI Interview - Vibe Coding Workflow

> Opus 4.5 ile context-separated development workflow

---

## 🎯 Temel Prensipler

### 1. Plan Sadakati
- **Plana %100 sadık kal** - docs/plans/ altındaki dokümanlara tam uyum
- **Ekstra feature YASAK** - Planda olmayan hiçbir şey ekleme
- **İkilemde SOR** - Belirsiz her noktada kullanıcıya sor

### 2. Context Separation
- **Her phase ayrı context** - Temiz başlangıç, odaklı çalışma
- **Task bazlı session** - Bir session = 1-3 related task
- **Doküman referansı** - Her session başında ilgili plan context'e alınır

### 3. Doküman Güncelliği
- **Phase bitişinde güncelle** - Yapılan değişiklikler dokümanlara yansıtılır
- **Sapmalar not edilir** - Plandan sapma varsa docs güncellenir
- **README güncellenir** - Implementation durumu takip edilir

---

## 📋 Phase Workflow

### Her Phase İçin Standart Akış

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PHASE WORKFLOW                                     │
└─────────────────────────────────────────────────────────────────────────────┘

1. PHASE BAŞLANGICI
   ├── Yeni context/chat aç
   ├── İlgili plan dokümanlarını oku (@docs/plans/...)
   ├── Task listesini gözden geçir (09-task-breakdown.md)
   └── Phase scope'unu teyit et

2. TASK IMPLEMENTATION
   ├── Bir task al
   ├── Kabul kriterlerini kontrol et
   ├── Implement et (plana sadık kal)
   ├── Test et
   └── Sonraki task'a geç

3. PHASE REVIEW
   ├── Tüm task'lar tamamlandı mı?
   ├── Kabul kriterleri karşılandı mı?
   ├── Plana uygunluk kontrolü
   ├── Test coverage (gerekiyorsa)
   └── Doküman güncelleme

4. PHASE TAMAMLAMA
   ├── docs/README.md güncelle
   ├── Varsa sapmaları not et
   └── Sonraki phase'e geç (yeni context)
```

---

## 🔄 Context Separation Stratejisi

### Phase Bazlı Context'ler

| Phase | Context/Chat | Referans Dokümanlar |
|-------|--------------|---------------------|
| Phase 1: Foundation | `context-phase1` | 01, 02, 04 |
| Phase 2: Session | `context-phase2` | 02, 03 |
| Phase 3: WebSocket | `context-phase3` | 01, 03 |
| Phase 4: Interview Engine | `context-phase4` | 05 |
| Phase 5: Audio | `context-phase5` | 06 |
| Phase 6: UI | `context-phase6` | 07, 06 |
| Phase 7: Polish | `context-phase7` | 08, 09 |

### Context Başlangıç Template'i

Her yeni context'e şu şekilde başla:

```
# Phase X: [Phase Name] Implementation

## Referans Dokümanlar
@docs/plans/09-task-breakdown.md (Task listesi)
@docs/plans/XX-relevant-doc.md (İlgili detay)

## Bu Phase'de Yapılacaklar
- Task X.1: [Açıklama]
- Task X.2: [Açıklama]
- ...

## Kurallar
1. Plana sadık kal
2. Ekstra feature ekleme
3. İkilemde sor
4. Test yaz (gerekiyorsa)

Başlayalım: Task X.1
```

---

## ✅ Phase Review Checklist

Her phase sonunda bu checklist'i kontrol et:

### Functionality
- [ ] Tüm task'lar implement edildi
- [ ] Tüm kabul kriterleri karşılandı
- [ ] Planda belirtilen özellikler çalışıyor

### Code Quality
- [ ] TypeScript hataları yok
- [ ] Lint hataları yok
- [ ] Naming conventions tutarlı

### Tests (Eğer phase gerektiriyorsa)
- [ ] Happy path testleri yazıldı
- [ ] Testler geçiyor

### Documentation
- [ ] Plandan sapma varsa not edildi
- [ ] README.md güncellendi
- [ ] Implementation status güncel

### Plan Uyumu
- [ ] Ekstra feature eklenmedi
- [ ] Scope dışına çıkılmadı
- [ ] Belirsizlikler soruldu ve çözüldü

---

## 🚫 YAPILMAYACAKLAR

1. **Planda olmayan feature ekleme**
2. **"İyileştirme" adı altında scope genişletme**
3. **Varsayım yapma** - Emin değilsen SOR
4. **Dokümanları güncellemeden geçme**
5. **Test yazmadan phase kapatma** (gerekliyse)

---

## 📝 Doküman Güncelleme Kuralları

### Ne Zaman Güncellenir?

1. **Phase tamamlandığında**
   - README.md implementation status
   - İlgili plan dokümanı (varsa değişiklik)

2. **Plandan sapma olduğunda**
   - Sapmanın nedeni
   - Yeni karar
   - İlgili doküman güncelleme

3. **Yeni karar alındığında**
   - Kesinleşen kararlar bölümü
   - İlgili teknik detay

### Nasıl Güncellenir?

```markdown
## Güncelleme Notu
> **Tarih:** YYYY-MM-DD
> **Phase:** X
> **Değişiklik:** [Açıklama]
> **Neden:** [Gerekçe]
```

---

## 🔍 Review Mekanizması

Her phase sonunda "Reviewer Mode" ile kontrol:

### Reviewer Prompt

```
# Phase X Review

Lütfen şunları kontrol et:

1. @docs/plans/09-task-breakdown.md'deki Phase X task'ları
2. Her task'ın kabul kriterleri
3. Implement edilen kod

Sorular:
- Tüm task'lar tamamlandı mı?
- Kabul kriterleri karşılandı mı?
- Plana uygunluk var mı?
- Ekstra eklenen bir şey var mı?
- Test yazılması gereken yer var mı?

Rapor ver.
```

---

## 📊 Implementation Tracking

### Status Ikonları

| İkon | Anlam |
|------|-------|
| ⏳ | Başlamadı |
| 🔄 | Devam ediyor |
| ✅ | Tamamlandı |
| ⚠️ | Sorun var |
| 🔍 | Review bekliyor |

### README.md Status Update

Her phase sonunda:

```markdown
## 📊 Implementation Status

| Phase | Status | Tasks | Notes |
|-------|--------|-------|-------|
| Phase 1 | ✅ | 5/5 | Tamamlandı |
| Phase 2 | 🔄 | 2/3 | Task 2.3 devam |
| Phase 3 | ⏳ | 0/4 | Başlamadı |
| ... | ... | ... | ... |
```

---

## 🎯 Session Best Practices

### Bir Session'da

**YAPIN:**
- Tek bir phase'e odaklan
- İlgili dokümanları context'e al
- Küçük, test edilebilir adımlarla ilerle
- Belirsizlikleri hemen sor

**YAPMAYIN:**
- Birden fazla phase'i karıştırma
- Context'i gereksiz bilgiyle doldurma
- Büyük değişiklikleri tek seferde yapma
- Varsayımlarla ilerleme

### Session Süresi

- Bir session idealde 1-3 task
- Çok uzun session'lar = kayıp context
- Doğal kırılma noktalarında yeni session

---

## 🔗 Bağlantılar

- [Task Breakdown](./plans/09-task-breakdown.md) - Tüm task'lar
- [System Architecture](./plans/01-system-architecture.md) - Genel mimari
- [Project Structure](./plans/04-project-structure.md) - Klasör yapısı

---

*Bu workflow, AI Interview projesi için optimize edilmiştir.*
*Vibe coding (Opus 4.5) ile uyumludur.*
