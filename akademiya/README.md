# Şəxsi Akademiya

Şəxsi LMS (öyrənmə platforması). claude.ai-da şəxsi Artifact kimi dərc olunub:
https://claude.ai/artifact/HmmZdg8oyvjiBU14uva5Kk

## Quruluş

```
akademiya/
  index.html            tətbiqin qabığı (Artifact səhifəsi: doctype/html/head/body YOXDUR, platforma özü əlavə edir)
  lms.css               dizayn tokenləri + bütün kurslar üçün ortaq komponentlər (.card, .note, .ex, .quiz, .tt, .btn …)
  lms.js                kataloq, marşrutlaşdırma (#kurs-N, #kurs-qeydler), testlər, qeydlər, irəliləyiş və bulud sinxronu
  courses/
    catalog.json        kursların siyahısı
    <id>/lessons.html   dərslər: hər dərs <section class="lesson" data-title="…">
    <id>/course.js      LMS.registerCourse('<id>', api => { … }) — testlərin datası və interaktiv hissələr
```

## Yeni kurs əlavə etmək

1. `courses/<id>/` qovluğu yarat (`id`: yalnız kiçik latın hərfləri və rəqəmlər, məsələn `statistika`).
2. `lessons.html`: hər dərs bir `<section class="lesson" data-title="Qısa ad">`. Test yeri: `<div class="quiz" data-quiz="acar"></div>`.
3. `course.js`:
   ```js
   LMS.registerCourse('statistika', function (api) {
     const QUIZ = { acar: [ {q:'Sual', o:['A','B'], a:0, e:'İzah'} ] };
     api.quizzes(QUIZ);            // testləri qurur; keçəndə dərs avtomatik tamamlanır
     // api.done(i)                // i-ci (0-dan) dərsi əl ilə tamamlanmış et
     // api.get(k) / api.set(k,v)  // kursa aid əlavə vəziyyət (buludda saxlanılır)
     // api.onUnmount(fn)          // taymerləri dayandırmaq üçün
   });
   ```
4. `catalog.json`-a yaz: `id, title, mark (bir simvol), description, lessons (say), parts ({"0":"I hissə"}), added`.
5. Yenidən dərc et (eyni Artifact URL-i ilə), yeni faylları `files` xəritəsinə əlavə et.

## İrəliləyiş və məxfilik

- Artifact şəxsidir: yalnız sahibi aça bilər (paylaşma Share menyusundan).
- İrəliləyiş `db` capability ilə `data/users/<istifadəçi-id>/<kurs-id>` sənədində saxlanılır — bu bölmə başqalarından, hətta artifact sahibindən də gizlidir; cihazlar arasında sinxronlaşır.
- Bulud əlçatan olmayanda hər şey brauzerin `localStorage`-ında saxlanılır və bulud qayıdanda birləşdirilir.

## Dərc

- Artifact: https://claude.ai/artifact/HmmZdg8oyvjiBU14uva5Kk (yenidən dərc edəndə bu URL-i `url` kimi ver)
- capabilities: `{ db: {}, user: {} }`

## Telefona quraşdırılan versiya (PWA)

- Öz repozitoriyası: `tardigrade23/akademiya` (bu qovluq həmin reponun kökü olur). Ünvan: https://tardigrade23.github.io/akademiya/
- `.github/workflows/pages.yml` əsas branch-a hər push-dan sonra `bash tools/build_pwa.sh _site` icra edib GitHub Pages-də dərc edir: `pwa/head.html` + `index.html` tam sənədə çevrilir, `sw.js`-də `__BUILD__` commit hash ilə əvəz olunur.
- `sw.js` quraşdırılanda kataloqdakı bütün kursları keşə yükləyir, ona görə dərslər oflayn açılır. Yeni kurs əlavə edəndə SW-də heç nə dəyişmək lazım deyil.
- PWA-da irəliləyiş cihazda (`localStorage`) saxlanılır; ana səhifədəki “Yedək nüsxə” ilə faylda saxlanılır/bərpa olunur.
- Səhifə `noindex` ilə axtarış sistemlərindən gizlədilib, amma pulsuz GitHub Pages üçün repo public olmalıdır: ünvanı bilən hər kəs dərs məzmununu aça bilər (irəliləyiş və qeydlər yalnız cihazda qalır).
- İkonlar: `python3 tools/make_icons.py`.
