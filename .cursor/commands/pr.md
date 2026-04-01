Pull request olustur.

## Adimlar

1. Branch bilgisi al: `git branch --show-current`
2. Tum commit'leri analiz et: `git log main..HEAD --oneline`
3. Tum degisiklikleri gor: `git diff main...HEAD --stat`
4. Detayli diff: `git diff main...HEAD`

5. PR title olustur:
   - Conventional format: `<type>(<scope>): <aciklama>`
   - Maksimum 70 karakter
   - Turkce veya Ingilizce (commit'lerin diline gore)

6. PR body olustur:

```markdown
## Ozet
- [Bullet point degisiklikler]

## Degisiklikler
- **[Modul]**: [Ne degisti]

## Test
- [ ] [Test adimlari]

## Guvenlik
[Auth/API degisikligi varsa belirt, yoksa "Guvenlik etkisi yok"]

## Veritabani
[Schema degisikligi varsa belirt, yoksa bu bolumu cikar]
```

7. **KRITIK**: Kullaniciya PR basligini ve body'yi goster.
8. Onay geldiginde:
   - Gerekirse push et: `git push -u origin <branch>`
   - PR olustur: `gh pr create --title "..." --body "..."`
9. PR URL'ini kullaniciya goster.
