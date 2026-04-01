Staged degisiklikleri analiz edip akilli commit mesaji olustur.

## Adimlar

1. `git diff --cached` calistir ve staged degisiklikleri analiz et
2. Degisiklik yoksa `git diff` ile unstaged degisiklikleri kontrol et ve staged olmayan dosyalari bildir
3. Conventional commit mesaji olustur:

**Format**: `<type>(<scope>): <aciklama>`

**Types**: feat, fix, refactor, docs, chore, perf, security, test

4. Body'de etkilenen dosyalari listele
5. **KRITIK**: Kullaniciya commit mesajini goster ve onay al. Onay OLMADAN commit yapma.
6. Onay geldiginde commit'i calistir
