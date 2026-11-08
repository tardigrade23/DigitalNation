/* Şəxsi Akademiya service worker
 * - Tətbiq faylları: əvvəlcə şəbəkə (həmişə təzə versiya), internet yoxdursa keşdən.
 * - Quraşdırılanda kataloqdakı BÜTÜN kurslar keşə yüklənir, ona görə də dərslər oflayn açılır.
 * - Google Fonts: əvvəlcə keş.
 * __BUILD__ dərc zamanı commit hash ilə əvəz olunur, köhnə keşlər silinir.
 */
const VERSION = 'akd-__BUILD__';
const APP_CACHE = VERSION + '-app';
const FONT_CACHE = 'akd-fonts';
const CORE = [
  './', 'index.html', 'lms.css', 'lms.js', 'manifest.webmanifest', 'courses/catalog.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(CORE);
    try {
      const cat = await (await fetch('courses/catalog.json', { cache: 'no-cache' })).json();
      const files = (cat.courses || []).flatMap(c => [`courses/${c.id}/lessons.html`, `courses/${c.id}/course.js`]);
      await cache.addAll(files);
    } catch (e) { /* kurslar ilk açılışda keşə düşəcək */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('akd-') && k !== APP_CACHE && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(req).then(hit => hit || fetch(req).then(res => { cache.put(req, res.clone()); return res; }))
      )
    );
    return;
  }

  if (!req.url.startsWith(self.registration.scope)) return;

  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(APP_CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(hit =>
          hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())
        )
      )
  );
});
