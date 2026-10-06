/* Service worker ANPER SE — cache hors-ligne (app shell + seed). */
const CACHE = 'anper-se-v98';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/styles.css',
  './js/data.js', './js/ui.js', './js/db.js', './js/charts.js',
  './js/pages.js', './js/pages2.js', './js/admin.js', './js/help.js', './js/cloud.js', './js/auth.js', './js/pointage.js', './js/app.js',
  './data/seed.json', './data/renaloc_coords.json', './data/localites_projets.json',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css',
  './icons/logo.png', './icons/niger-flag.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Ne pas intercepter les requêtes externes (Microsoft Graph, login, CDN MSAL) :
  // le cache casserait l'authentification et la synchro.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  // Battement de cœur du lanceur local : ne jamais mettre en cache ni intercepter.
  const path = new URL(e.request.url).pathname;
  if (path.startsWith('/__ping')) return;
  // Fichiers voisins servis par le NAS (menu, page de téléchargement, carte VIDA,
  // installateurs, APK) : jamais mis en cache, sinon le navigateur garde une
  // ancienne version (ex. menu sans la Messagerie).
  if (/\/(menu|telechargements|carte_vida)\.html$/.test(path) || /\/installer\//.test(path) || /\.(apk|exe|bat|pdf)$/.test(path)) return;
  // Pages (navigation) : réseau d'abord, cache seulement hors connexion
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html'))));
    return;
  }
  e.respondWith(
    // ignoreSearch : « js/app.js?v=93 » correspond à « js/app.js » mis en cache à l'installation
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
