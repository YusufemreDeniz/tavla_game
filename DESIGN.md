# DESIGN.md — Kız Tavlası Online Tasarım Sözleşmesi

> Bu belge, Claude Code ve geliştiricilerin tasarım çalışmalarında başvuracağı **tek kaynaktır**.
> Görsel referans: [`design-previews/a3-final.html`](design-previews/a3-final.html) (A3 — Modern Tavla Kulübü, Premium Edition, onaylandı).
> İşlevsel doğruluk kaynağı: mevcut React uygulaması (`src/KizTavlasi.Web`). A3 yalnızca **görünüm** referansıdır; iş mantığını, doğrulama mesajlarını, API sözleşmelerini ve kullanıcı akışlarını değiştirmez.
> Token'lar: [`src/KizTavlasi.Web/src/styles/tokens.css`](src/KizTavlasi.Web/src/styles/tokens.css) · Palet: [`src/KizTavlasi.Web/src/index.css`](src/KizTavlasi.Web/src/index.css)

Durum: **Aşama 3.1 (Foundation)**. Token'lar tanımlı, henüz hiçbir bileşen tüketmiyor. Mevcut ekranlar eski görünümünü korur. Bileşen göçü Aşama 3.2+ işidir.

---

## 1. Tasarım felsefesi

1. **Oyun masası bir kulüp salonudur, slot makinesi değil.** Sakin, rafine, güven veren. Gösteriş yerine disiplin.
2. **Etkileşim önce gelir.** Dekor, oda kurma ve katılma akışını geri plana atmaz. Dekoratif öğe kullanıcıyı kaydırmaya zorlamaz.
3. **Kontrollü kimlik.** Ahşap, bordo ve altın *vurgu* olarak kullanılır; zemin her zaman gece laciverttir.
4. **Tek net eylem.** Her görünümde tek bir birincil (altın) eylem vardır.
5. **Erişilebilirlik tasarımın parçasıdır**, sonradan eklenen bir katman değil.

## 2. Marka kimliği

| | |
|---|---|
| Ürün adı | **Kız Tavlası Online** (`src/config/branding.ts` → `PRODUCT_NAME`; metni koddan tek yerden alın, elle yazmayın) |
| Slogan | "Arkadaşınla linki paylaş, gerçek zamanlı kız tavlası oyna." (`PRODUCT_TAGLINE`) |
| Ton | Türkçe, samimi ama saygılı; ünlem yalnızca oyun olaylarında (Mars gibi) |
| Motif | 6 haneli tavla tahtası ve pullar (altın disk + bordo halka). Üçgen/pul dili başka motifle karıştırılmaz |
| İkon dili | `lucide-react`, 1.8 stroke; yeni ikon kütüphanesi eklenmez |

## 3. Renk kuralları

### 3.1 Primitive paleti (mevcut adlar **değiştirilmez**)
`night-300…950`, `cream-50…400`, `walnut-500…900`, `bordo-400…700`, `rose-400`, `copper-400/500`, `gold-200/400/500/600`, ayrıca A3 için eklenenler: `night-750/400/300`, `stone-300/400/500`, `gold-600/200`, `bordo-550/400`, `error-400`, `danger-500`, `ink-900`.
Primitive'ler doğrudan bileşende **kullanılmaz** (mevcut kod istisna; göç sırasında semantic'e çevrilir).

### 3.2 Semantic roller (bileşenler bunları kullanır)

| Grup | Token | Değer (A3) |
|---|---|---|
| Surface | `surface-page` | night-900 `#141826` |
| | `surface-raised` | night-800 (kart, seçenek, modal) |
| | `surface-hover` | night-750 `#1f2538` |
| | `surface-input` | night-950 |
| | `surface-wood` / `-light` / `-dark` | walnut-700 / 600 / 800 |
| | `surface-selected` / `-top` | bordo-600 / bordo-550 |
| Text | `fg-primary` | cream-100 `#f0e6d2` |
| | `fg-prose` | cream-200 (uzun metin) |
| | `fg-secondary` | stone-300 `#cfc3ab` |
| | `fg-muted` | stone-400 `#a99f8b` |
| | `fg-placeholder` | stone-500 `#9a917f` |
| | `fg-accent` | gold-400 |
| | `fg-on-gold` | ink-900 `#1a110b` |
| Action | `action-primary(-from/-to/-border)` | altın degrade (gold-400 → 500 → 600) |
| | `action-secondary(-from/-hover/-border)` | bordo |
| | `action-tertiary(-border/-fg)` | altın çerçeve, şeffaf zemin |
| Line | `line-subtle`, `line-control`, `line-control-hover`, `line-selected`, `line-accent`, `line-focus`, `line-indicator` | |
| Status | `status-error-fg/-border`, `status-danger`, `status-success-fg` | error-400 `#e58a9a`, danger-500, gold-400 |

Tailwind kullanımı: `bg-surface-raised`, `text-fg-secondary`, `border-line-control`. Semantic token yoksa **önce token ekleyin**, bileşende ham hex yazmayın.

### 3.3 Kullanım kuralları
- **Zemin gece laciverttir.** Ahşap yalnızca: hane çerçevesi (plate), ayırıcı çubuk (rail), modal çerçevesi, adım pullarının bordo halkası. Tam sayfa/geniş panel ahşap **yasak**.
- **Altın**: birincil eylem, seçili durum çerçevesi, focus, pul. Altın metin yalnızca koyu zeminde.
- **Altın üstünde metin koyudur** (`fg-on-gold`). Bordo üstünde metin krem (`fg-on-action`).
- **Bordo üstünde altın metin yasak** (3.8:1, AA başarısız). Seçili seçenekte metin krem, altın yalnızca çerçeve ve pul için.
- Renk tek başına bilgi taşımaz: seçili durum **renk + pul göstergesi** ile belirtilir; hata **renk + ikon + metin** ile.

## 4. Tipografi

| Rol | Aile (token) | Kullanım |
|---|---|---|
| Brand / başlık | **Fraunces** (`font-brand`) | h1, h2, modal başlığı, adım numarası |
| Arayüz / gövde | **Inter** (`font-ui`) | her şey (form, düğme, paragraf) |
| Kod | **IBM Plex Mono** (`font-code`) | oda kodu |

Ölçek (px, satır yüksekliği): `display-xl` 68/1.04 (h1 masaüstü) · `display-lg` 54 (tablet) · `display-md` 40 (mobil h1) · `heading-lg` 30 · `heading-md` 26 · `body-lg` 18 (slogan) · `body` 16 (input, düğme) · `ui` 15 (seçenek başlığı) · `ui-sm` 14 (etiket, yardım) · `caption` 13.5 (hata, alt bilgi) · `micro` 12.5 (seçenek alt etiketi).
Ağırlıklar: 400 gövde, 500 etiket/h1, 600 seçenek başlığı/vurgu, 700 düğme.
Kurallar:
- **12 px altı metin yasak.** Sığdırmak için metni küçültmeyin; düzeni değiştirin.
- Başlıklarda `tracking-display` (-0.02em) / `tracking-heading` (-0.01em); gövdede tracking yok.
- Oda kodu: mono, 20–22 px, `tracking-code`, büyük harf (girdi `toUpperCase()`).
- Türkçe karakterler (ğ Ğ ı İ ş Ş ç Ç ö Ö ü Ü) her fontta görsel olarak test edilir. `text-transform: uppercase` kullanan yerlerde `lang="tr"` zorunlu (i→İ).

### Font stratejisi (özet — ayrıntı §13)
Fontlar **self-host** edilir (Aşama 3.3): `src/assets/fonts/*.woff2` + `src/styles/fonts.css`; kaynak/lisans/sürüm: `src/assets/fonts/FONTS.md`. Üretim CSP'si `font-src 'self'; style-src 'self' 'unsafe-inline'` olduğu için Google Fonts üretimde **engellenir**; prototiplerdeki `<link>` yalnızca önizleme içindir. `--font-brand/--font-ui/--font-code` aileleri tanımlı ve yüklenebilir; **henüz hiçbir sayfa kullanmıyor** (html hâlâ `--font-body` = system-ui), bu yüzden tarayıcı bugün font dosyası indirmez. Sayfalar Aşama 3.4'ten itibaren `font-brand/font-ui/font-code` sınıflarını kullanır. Fallback: `Fraunces → Georgia → Times New Roman → serif`, `Inter → system-ui → Segoe UI → sans-serif`, `IBM Plex Mono → ui-monospace → SFMono → Menlo → Consolas → monospace`.

## 5. Semantic token isimlendirmesi

`--<kategori>-<rol>[-<varyant>][-<durum>]`, küçük harf, kebab-case.
- **Primitive:** `--color-<aile>-<basamak>` (basamak 50–950, mevcut skalayı izler).
- **Semantic:** `--color-surface-*`, `--color-fg-*`, `--color-action-<öncelik>[-from|-to|-hover|-border|-fg]`, `--color-line-*`, `--color-status-*`.
- **Diğer:** `--text-*` (+ `--text-*--line-height`), `--font-*`, `--radius-*`, `--shadow-*`, `--duration-*`, `--ease-*`, `--focus-*`, `--z-*`, `--layout-*`, `--size-*`.
- Adı **görünüme** değil **role** göre koyun (`surface-raised` ✔, `dark-blue-box` ✘).
- Semantic token yalnızca primitive'e `var()` ile bağlanır; semantic → semantic zinciri en fazla 1 seviye.
- `tokens.css` Tailwind 4 `@theme static` kullanır; `index.css` içindeki palet bloğu da `static`tir (semantic katman ona bağlı).

## 6. Bileşen tasarım ilkeleri

Spacing 4 px tabanlıdır (Tailwind varsayılan `--spacing`). Radius: `control-sm` 10 (ikon düğmesi), `control` 12 (input/seçenek/düğme), `panel` 16, `dialog` 18, `rail` 5, `pill` tam yuvarlak.

- **Düğme hiyerarşisi:** altın (birincil: "Oda Oluştur") › bordo (ikincil: "Odaya Katıl") › çerçeveli altın (üçüncül: bot). Aynı bölgede iki altın düğme yok. Yükseklik ≥ 54 px, tam genişlik.
- **Input:** 50 px, `surface-input`, `line-control` kenarlık; hover `line-control-hover`; focus altın kenarlık + `focus-glow`; hata `status-error-border` + `aria-invalid="true"` + `role="alert"` ikonlu mesaj; devre dışı opaklık 0.5.
- **Seçenek (radio) grubu:** `role="radiogroup"` + `role="radio"` + `aria-checked`; roving `tabIndex`; ok tuşları. Pul göstergesi (sol/üst), seçili: bordo degrade + altın çerçeve + altın pul. Format/süre üçlü yatay kalır (mobilde 106×79 px).
- **Kart/Panel:** `surface-raised`, `line-subtle` çerçeve. Gölge yalnızca yükseltilmiş yüzeyde (`shadow-plate`, `shadow-dialog`, `shadow-button-gold`).
- **Modal (uygulandı, Aşama 3.5):** `components/ui/Dialog.tsx` — native `<dialog>` + `showModal()`, kontrollü `open` + `onClose`. Tarayıcıdan gelenler (ek JS focus trap YAZILMAZ): top layer, arka planın inert olması (erişilebilirlik ağacından da çıkar), Tab/Shift+Tab'ın sayfa içeriğine kaçmaması, kapanışta odağın tetikleyiciye dönmesi. Bileşenin eklediği: `cancel` (Esc) olayında `preventDefault` + `onClose` (karar çağırana ait), programatik `close()` olaylarını yok sayma, açılışta odağın kapat düğmesine verilmesi, backdrop tıklaması (içerik sarmalayıcıda olduğundan yalnızca `::backdrop`), StrictMode/unmount güvenliği, `showModal` olmayan ortamda `open` özniteliği geri dönüşü. Başlık `aria-labelledby` ile ad olur; isteğe bağlı `description` `aria-describedby` ile bağlanır. Gövde kaydırılabilir ve `tabindex=0` (odak halkası içten `ring-inset`; dış outline `overflow-hidden` ile kırpılırdı). Dialog kendi fontlarını taşır (`font-ui`, başlık `font-brand`): sayfa font kapsamının dışında render edilse de doğru çıkar. Not: Tab, pencere içindeki son öğeden sonra tarayıcı arayüzüne (adres çubuğu) geçebilir; bu tarayıcı davranışıdır, sayfa içeriğine odak kaçmaz. Test notu: jsdom `showModal/close` uygulamaz; `src/test/dialog.ts` yalnızca kısmi taklittir (top layer/inert/Tab/Esc YOK) — bu davranışlar gerçek tarayıcıda (Playwright) doğrulanır.
- **Loading:** yalnızca ilgili eylemin alanları kilitlenir; bağımsız eylemler (ör. "Odaya Katıl") kilitlenmez. Düğme `aria-busy="true"`, metin değişir ("Oda oluşturuluyor…"), spinner `aria-hidden`.
- **Durum ekranı (Aşama 3.7B):** `components/ui/StateScreen.tsx` — tam sayfa, ortalanmış `Panel`, ahşap şerit, tek `<h1>` (Fraunces), açıklama (Inter 16 px), eylem düğmeleri (dar ekranda alt alta). Yalnızca sunum; metin ve mantık çağırandadır. `LoadingScreen` yükleniyor durumunu `role="status"` ile duyurur (dönen halka azaltılmış harekette global kuralla durur). Tek birincil eylem altın, ikincil eylem nötr çerçeveli (`ghost`). Oda giriş ve bağlantı ekranları bunu kullanır; fontlar ekran kapsamındadır.
- **Ahşap bileşenler** (`plate`, `rail`): süs; `aria-hidden="true"`, odaklanamaz.
- Yeni bileşenler önce semantic token ile yazılır; yeni görsel değer gerekiyorsa önce `tokens.css`'e eklenir.

## 7. Responsive kurallar

| Aralık | Gutter | Düzen |
|---|---|---|
| < 768 (mobil, hedef 375) | 20 px | Tek sütun: Oda Oluştur → Bot → Odaya Katıl → Nasıl oynanır. Plate gizli. Seçenekler dikey pul düzeniyle üçlü yatay. "Oda Oluştur" ilk 812 px içinde |
| 768–1100 (tablet) | 40 px | İki sütun; plate 300 px; seçenekler dikey pul düzeni |
| > 1100 (masaüstü, hedef 1280) | 96 px | İki sütun, `max-w-page` 1280; seçenekler satır içi pul |

Kırılımlar `md`(768) ve özel 1100. Yatay taşma **0** olmalı (375/768/1280'de ölçülür).

## 8. Erişilebilirlik standartları (WCAG 2.2 AA)

- Metin kontrastı ≥ 4.5:1, büyük metin ve UI bileşen sınırı ≥ 3:1. Yeni renk çifti eklerken ölçüp PR'a yazın.
- Dokunma hedefi **≥ 44×44 px** (`size-touch-min`).
- Focus: `:focus-visible`, 3 px `line-focus` halkası, 3 px offset; input'ta `focus-glow`. `outline: none` yalnızca eşdeğer bir gösterge varsa. Global kural (`index.css`, **`@layer base`** içinde) yardımcı sınıfı olmayan öğelerde 2 px/2 px altın halka verir; UI bileşenleri `focusRing` yardımcılarıyla 3 px/3 px'e geçer. **`!important` kullanılmaz**: katmansız kural katmanlı yardımcıları ezeceğinden global kural katmana alınmıştır. Yeni global CSS kuralını katmansız yazmayın (`@layer base|components` kullanın).
- Klavye: tüm eylemler klavyeyle; mantıklı Tab sırası; radio gruplarında ok tuşları; modalda odak tuzağı.
- Anlamsal HTML: `label for`, `fieldset/legend`, `aria-describedby` (hata), `aria-invalid`, `role="alert"`/`status`, `aria-busy`, dekoratif SVG `aria-hidden`.
- `lang="tr"` her zaman; ikon-yalnız düğmelerde `aria-label` (ör. "Sesi kapat"/"Sesi aç").
- `prefers-reduced-motion` saygı görür (`index.css` global kuralı + spinner yavaşlatma).

## 9. Motion kuralları

- Geçişler `--duration-fast` (150 ms), glow/görünürlük `--duration-base` (350 ms), spinner 800 ms (reduced-motion: 2400 ms).
- Yalnızca `opacity`, `transform`, renk geçişleri. Layout animasyonu yok.
- Oyun animasyonları (`index.css` keyframe'leri, framer-motion) bu aşamada değiştirilmez.
- Animasyon bilgi taşıyorsa (zamanlayıcı acil) renk/metin gibi animasyonsuz bir ipucu da olmalı.
- Dekoratif sürekli animasyon yasak.

## 10. Kullanılmaması gereken desenler

- ✘ Tam sayfa/büyük ahşap panel ve ağır doku (A2 deseni); ahşap yalnızca §3.3'teki yerlerde.
- ✘ Jenerik "AI dashboard" görünümü: mor-mavi degradeler, cam efekti (glassmorphism), neon parlamalar, emoji-ikon.
- ✘ Bordo üstünde altın metin; altın üstünde krem metin; 12 px altı metin.
- ✘ Renk-tek-başına durum göstergesi.
- ✘ Bileşende ham hex/`rgb()`; semantic token yerine primitive; rastgele `px` radius/gölge.
- ✘ Yeni UI kütüphanesi, ikon seti veya font ailesi (onay olmadan).
- ✘ Google Fonts `<link>`'i üretimde (CSP engeller; self-host).
- ✘ Bağımsız eylemleri gereksiz kilitleyen loading.
- ✘ Dekoratif öğenin etkileşimi veya içeriği geri plana itmesi; mobilde gereksiz kaydırma.
- ✘ Metni sığdırmak için küçültmek; `text-transform` ile Türkçe i/İ bozmak.

## 11. A3 referansına bağlı uygulama kuralları

1. A3, **görünüm** referansıdır; davranış/doğrulama kaynağı mevcut React koddur (zod mesajları `HomePage.tsx`'te; kopyalanır, yeniden yazılmaz).
2. A3'te CSS'teki her değer bir token'a karşılık gelir (aşağıdaki tablo). Karşılığı olmayan değer görürseniz token ekleyin, sabiti gömmeyin.
3. Bilinçli yaklaşıklamalar (A3 hex → mevcut primitive): dialog `#1a1f31`/raised `#1a2033` → `night-800 #1c2133`; input `#0f1320` → `night-950 #0e111a`; `gold-lt #e6c768` → `gold-400 #e3c565`; ahşap `#664a33/#3b291b` → `walnut-600 #6b4a32 / walnut-800 #3e2c1e`; `cream-2/3` iki yeni ton (`stone-300/400`). Kontrast yalnızca iyileşir veya AA'da kalır; yine de göç sırasında ölçün.
4. Ana sayfa göçü Aşama 3.3'tür. Oyun tahtası ve zar bileşenleri tasarım göçünden ayrı tutulur.

### A3 → token eşleme tablosu
| A3 (prototip değişkeni / değeri) | Token |
|---|---|
| `--night #141826` | `surface-page` (night-900) |
| `--raised #1a2033`, dialog `#1a1f31` | `surface-raised` (night-800) |
| `--hover #1f2538` | `surface-hover` (night-750) |
| `--night-in #0f1320` | `surface-input` (night-950) |
| `--wood/--wood-lt/--wood-dk` | `surface-wood(-light/-dark)` |
| `--cream #f0e6d2` / `--cream-2 #cfc3ab` / `--cream-3 #a99f8b` | `fg-primary` / `fg-secondary` / `fg-muted` |
| placeholder `#9a917f` | `fg-placeholder` |
| `--gold #d4af37`, `--gold-lt`, `--gold-dk #a8892a` | `action-primary`, `-from`, `-to` |
| `--bordo #8e2f3c`, `--bordo-top #9a3544`, `--bordo-bd #b45466` | `surface-selected`, `-top`, `action-secondary-border` |
| `--line #7d86a0`, hover `#a1a9c0` | `line-control`, `line-control-hover` |
| `--line-soft rgba(240,230,210,.18)` | `line-subtle` |
| `--err #e58a9a` | `status-error-fg/-border` |
| h1 68/54/40, h2 30/26 | `text-display-xl/lg/md`, `text-heading-lg/md` |
| radius 12 / 10 / 16 / 18 | `rounded-control` / `-control-sm` / `-panel` / `-dialog` |
| plate/rail/gold/dialog gölgeleri | `shadow-plate/-rail/-button-gold/-dialog` |
| focus 3 px altın + glow | `--focus-ring-*`, `--focus-glow(-error)` |
| 150 ms geçiş, 800 ms spinner | `--duration-fast`, `--duration-spin` |

## 12. Yeni sayfa geliştirme standartları

1. Başlamadan bu belgeyi ve `tokens.css`'i okuyun; mevcut sayfaları inceleyin, mimariyi bozmayın.
2. Yalnızca semantic token kullanın; eksik token → önce `tokens.css` + bu belge, sonra bileşen.
3. Önce mobil 375, sonra 768 ve 1280. Yatay taşma, 44 px hedef, klavye gezinmesi ve focus göstergesi **her sayfada** doğrulanır.
4. Tüm durumlar tasarlanır ve test edilir: varsayılan, hover, focus, disabled, loading, hata, boş.
5. Metinler Türkçe ve mevcut terminolojiyle (Oda, Hane, Pul, Zar, Mars…) tutarlı; kopya yeni özellik icat etmez.
6. Davranış testleri (Vitest/RTL) eklenir veya korunur; **mevcut testler silinmez/zayıflatılmaz**. Referans: 95 geçen Vitest testi.
7. Doğrulama sırası: `npm run typecheck` → `npm run lint` → `npm run test` → `npm run build`. Görsel değişiklik bekleniyorsa önce/sonra ekran görüntüsü ile kanıtlayın; beklenmiyorsa piksel-özdeşliği doğrulayın.
8. Yeni bağımlılık, font ailesi veya UI kütüphanesi onay gerektirir.
9. Prototipler (`design-previews/`) referanstır; üretim koduna kopyalanmaz, token'lara çevrilerek uygulanır.

## 13. Font self-host (Aşama 3.3 — uygulandı)

**Dosyalar:** `src/assets/fonts/` (6 × WOFF2 + 3 × OFL metni + `FONTS.md`). Tanımlar: `src/styles/fonts.css` (`font-display: swap`, latin + latin-ext `unicode-range`). Vite dosyaları içerik-hash'li, aynı-origin `/assets/*` yoluna yazar.
**Kaynak:** Google Fonts resmî CDN'i (gstatic WOFF2). Lisans: üçü de SIL OFL 1.1; metinler upstream depolarından (Fraunces, Inter, IBM Plex) alınıp klasörde saklanır; dosyaların `name` tablosundaki telif/lisans URL'si doğrulandı (ayrıntı `FONTS.md`).
**Boyut (ölçülmüş, bayt):**

| Aile | latin | latin-ext | Ağırlık |
|---|---:|---:|---|
| Fraunces (değişken) | 67 304 | 59 388 | 500–600 |
| Inter (değişken) | 48 256 | 85 068 | 400–700 |
| IBM Plex Mono | 14 888 | 13 432 | 500 |
| **Toplam** | **130 448** | **157 888** | **288 336 (~281,6 KiB)** |

> Not: 3.1'de yazılan önceki boyut tablosu latin/latin-ext sütunlarını karıştırmıştı ve eksikti; yukarıdaki değerler indirilen dosyalardan ölçülmüştür.

**Türkçe sayfanın gerçek maliyeti:** ğ Ğ İ ş Ş `latin-ext`'te olduğundan Türkçe metin her ailede **iki dosyayı** da tetikler. Sayfada Fraunces + Inter + (oda kodu varsa) Plex kullanılırsa ≈ 67 + 59 + 48 + 85 + 15 ≈ **274 KB**; Plex latin-ext yalnızca oda kodunda latin dışı karakter varsa gelir.
**Optimizasyon fırsatı (uygulanmadı):** latin-ext dosyaları altı Türkçe harf için büyük (Inter 85 KB, Fraunces 59 KB). Yalnızca `U+011E-011F, U+0130-0131, U+015E-015F` içeren Türkçe alt kümesi (pyftsubset/glyphhanger veya Google `&text=` ile) birkaç KB'a iner. Bu, OFL'nin yeniden-adlandırma koşullarının (özellikle IBM Plex "Reserved Font Name") ve bakım maliyetinin gözden geçirilmesini gerektirir → ayrı bir karar.
**Önbellek:** `public/sw.js` same-origin `/assets/*` GET yanıtlarını (network-first, çevrimdışı fallback) zaten önbelleğe alır; hash'li font dosyaları bu kurala girer, service worker değişikliği gerekmez. Sunucu tarafında `UseStaticFiles()` varsayılan başlıklarla çalışır; hash'li `/assets/*` için `Cache-Control: public, max-age=31536000, immutable` backend değişikliği gerektirir (ayrı karar).
**Preload:** Sayfalar fontları kullanmaya başlayınca (3.4) kritik `latin` dosyaları için preload değerlendirilir; hash'li ad nedeniyle Vite'ın HTML dönüşümü doğrulanarak eklenmelidir.
**Doğrulama kuralı:** Font yüklemesi `document.fonts.check()` ile değil; ağ isteği (200, same-origin, `font/woff2`) + `FontFace.status === 'loaded'` + CDP platform font (`isCustomFont`) + Türkçe 12 harf glif sayısı ile birlikte kanıtlanır.
