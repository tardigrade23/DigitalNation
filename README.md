# Digital Nation 🏳️

Brauzerdə işləyən **idle nation simulator** prototipi. 1 milyon əhalisi olan kiçik rəqəmsal dövlətdən başlayıb dünyanın ən qabaqcıl rəqəmsal dövlətini qurursan.

## Necə işə salmaq

Heç bir quraşdırma lazım deyil. `index.html` faylını brauzerdə aç.

İstəsən lokal server ilə də aça bilərsən:

```bash
python3 -m http.server 8000
# sonra: http://localhost:8000
```

Oyun hər 5 saniyədən bir brauzerin `localStorage`-inə avtomatik yazılır.

## Əsas mexanikalar

| Sistem | Necə işləyir |
|---|---|
| **ÜDM (GDP)** | Əsas valyuta. Sektorlar saniyəbəsaniyə ÜDM gətirir, "Vergi topla" düyməsi isə klik başına gətirir |
| **10 sektor** | İnternet Provayderi → E-Hökumət → … → Peyk İnterneti. Hər sektor 25 / 50 / 100 / 200… ədədə çatanda gəliri x2 olur |
| **Əhali və rifah** | Sektorlar artdıqca əhali və rifah yüksəlir. İkisi də bütün gəlirə multiplikator verir. Smart City rifaha ən çox təsir edir |
| **Texnologiya reytinqi** | Ümumi qazanca görə #195-dən #1-ə qalxırsan |
| **Təkmilləşdirmələr** | Sektor gücləndirmələri, AI multiplikatorları (bütün gəlir) və klik gücləndirmələri |
| **Kibertəhlükəsizlik** | Hər 1.5–2.5 dəqiqədən bir hakerlər hücum edir. 12 saniyə ərzində dəf etsən mükafat alırsan. Etməsən, müdafiə səviyyəsi qərar verir: uğursuz olarsa ÜDM-in 10%-i itir və gəlir 30 saniyəlik yarıya düşür |
| **Texnologiya ixracı (prestij)** | Dövləti sıfırlayıb Beynəlxalq Nüfuz qazanırsan. Hər xal bütün gəliri daimi olaraq +10% artırır |
| **Offline gəlir** | Oyunda olmadığın müddətdə (maks. 8 saat) gəlirin 50%-ni qazanırsan |
| **x2 Bonus** | 2 dəqiqəlik x2 gəlir. Real oyunda bunun yerində "reklama bax" (rewarded ad) olacaq |

## Fayllar

- `index.html`: interfeys strukturu
- `style.css`: dizayn, mobil uyğunluq daxil
- `game.js`: bütün oyun məntiqi. Balans sabitləri faylın əvvəlindədir (`SECTORS`, `COST_GROWTH`, `PRESTIGE_DIVISOR` və s.)

## Növbəti addımlar üçün ideyalar

- Balansı real oyunçu testləri ilə tənzimləmək (ilk 10 dəqiqə və ilk prestijə qədər olan vaxt)
- Gündəlik bonuslar və VIP
- Gem mağazası: vaxt atlatma, daimi x2, kosmetik bayraqlar
- Səs effektləri və animasiyalar
- Mobil tətbiq kimi paketləmək (Capacitor və ya PWA)
