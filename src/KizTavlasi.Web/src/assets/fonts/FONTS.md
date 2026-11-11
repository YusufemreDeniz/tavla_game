# Self-host fontlar — kaynak, lisans, sürüm

Fontlar uygulamanın kendisinden (aynı origin, `/assets/*`) sunulur; Google Fonts bağlantısı **kullanılmaz**.
`@font-face` tanımları: [`../../styles/fonts.css`](../../styles/fonts.css). Tasarım sözleşmesi: proje kökündeki `DESIGN.md`.

## Lisans

Üç aile de **SIL Open Font License 1.1** altındadır. Lisans metinleri üretici (upstream) depolarından alınmıştır ve bu klasörde saklanır (lisansın dağıtım koşulu: metin fontla birlikte korunur):

| Aile | Lisans metni (bu klasör) | Upstream kaynak | Telif satırı (lisans metni) |
|---|---|---|---|
| Fraunces | `OFL-Fraunces.txt` | https://github.com/undercasetype/Fraunces (`OFL.txt`) | Copyright 2018 The Fraunces Project Authors |
| Inter | `OFL-Inter.txt` | https://github.com/rsms/inter (`LICENSE.txt`) | Copyright (c) 2016 The Inter Project Authors |
| IBM Plex Mono | `OFL-IBM-Plex.txt` | https://github.com/IBM/plex (`LICENSE.txt`) | Copyright © 2017 IBM Corp. with Reserved Font Name "Plex" |

Font dosyalarının kendi `name` tablosundan okunan telif/lisans alanları (dosyalar indirildikten sonra doğrulandı):

| Dosya ailesi | Sürüm (name ID 5) | Telif (name ID 0) | Lisans URL (name ID 14) |
|---|---|---|---|
| Fraunces (değişken) | Version 1.000;[b76b70a41] | Copyright 2020 The Fraunces Project Authors (github.com/undercasetype/Fraunces) | https://scripts.sil.org/OFL |
| Inter (değişken) | Version 4.001;git-66647c0bb | Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) | https://openfontlicense.org |
| IBM Plex Mono Medium | Version 2.3 | Copyright 2017 IBM Corp. All rights reserved. | http://scripts.sil.org/OFL |

Notlar:
- Fraunces için lisans dosyasında 2018, font `name` tablosunda 2020 yazıyor; ikisi de aynı projenin (Fraunces Project Authors) OFL telifidir.
- IBM Plex'in OFL'si "Reserved Font Name 'Plex'" içerir. Dosyalar Google Fonts'un yayımladığı biçimle (yalnızca alt küme/WOFF2 dönüşümü) aynen kullanılır; ad veya içerik değiştirilmez. Yayımlanan dosyaları kendimiz yeniden alt kümeleyecek olursak OFL'nin ad/yeniden-adlandırma koşulları yeniden okunmalıdır.
- `name` tablosunda lisans açıklaması (ID 13) alanı Google'ın alt küme dosyalarında boştur; bu yüzden lisans doğrulaması URL + telif satırı + upstream OFL metni ile yapıldı.

## Dosyalar (Google Fonts resmî CDN'inden, https://fonts.googleapis.com/css2 yanıtındaki gstatic WOFF2 URL'leri)

Kaynak CSS isteği: `family=Fraunces:opsz,wght@9..144,500..600&family=Inter:wght@400..700&family=IBM+Plex+Mono:wght@500` (Google Fonts API, `font-display=swap`). Fontlar Google Fonts'ta OFL altında yayımlanır. İndirme tarihi: 2026-11-10.

| Dosya | Boyut (bayt) | Alt küme | Ağırlık | SHA-256 | gstatic URL |
|---|---:|---|---|---|---|
| `fraunces-latin.woff2` | 67 304 | latin | 500–600 (değişken) | `7234ed86…d783` | `fraunces/v38/6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0KxC9TeA.woff2` |
| `fraunces-latin-ext.woff2` | 59 388 | latin-ext | 500–600 (değişken) | `a2930b27…f88e` | `fraunces/v38/…Wa0KxCFTeO-U.woff2` |
| `inter-latin.woff2` | 48 256 | latin | 400–700 (değişken) | `3100e775…4c62` | `inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2` |
| `inter-latin-ext.woff2` | 85 068 | latin-ext | 400–700 (değişken) | `34b9c504…c956` | `inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa25L7SUc.woff2` |
| `ibm-plex-mono-500-latin.woff2` | 14 888 | latin | 500 | `01d28544…8e22` | `ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3twJwlBFgg.woff2` |
| `ibm-plex-mono-500-latin-ext.woff2` | 13 432 | latin-ext | 500 | `6bb06407…99ea` | `ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3twJwl5FgtIU.woff2` |

Toplam (altı dosya): **288 336 bayt (~281,6 KiB)**. Tarayıcı yalnızca sayfada kullanılan karakterlerin alt kümesini indirir; Türkçe bir sayfa hem `latin` hem `latin-ext` gerektirir (ğ Ğ İ ş Ş latin-ext'tedir). Gerçek kullanım için bkz. DESIGN.md §13.

## Kapsam kontrolü
- Türkçe: ğ Ğ İ ş Ş → latin-ext (U+011E/011F, 0130, 015E/015F); ı → latin (U+0131); ç Ç ö Ö ü Ü â → Latin-1 (latin).
- Tarayıcı doğrulaması (platform font + ağ isteği + glif) aşama raporunda.

## Güncelleme
Sürüm değiştirirken: yeni dosyaları aynı kaynaktan indirin, bu tablodaki boyut/SHA-256/sürüm alanlarını ve OFL metinlerini güncelleyin, `fonts.css`'teki `unicode-range` değerlerini Google'ın yeni CSS yanıtıyla karşılaştırın.
