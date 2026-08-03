/**
 * Service worker Rise Up.
 *
 * Doua roluri:
 *   1. Face site-ul instalabil ca aplicatie (PWA).
 *   2. Il face sa mearga si offline / mai repede — tinem "coaja" aplicatiei
 *      (HTML, CSS, JS, logo-uri) in cache.
 *
 * NU ne atingem de pozele servite de Worker/R2 (alt domeniu) — alea au deja
 * cache la edge; aici pastram doar fisierele site-ului.
 */

const CACHE = 'riseup-v1';

// Fisierele de baza. Le adaugam individual (allSettled) ca un singur 404
// sa nu strice instalarea service worker-ului.
const COAJA = [
  '/', '/index.html', '/galerie.html', '/triburi.html', '/regulament.html',
  '/styles.css', '/main.js', '/manifest.webmanifest',
  '/logo-dark.png', '/logo-light.png', '/favicon.png',
  '/icons/icon-192.png', '/icons/icon-512.png',
  '/js/galerie.js', '/js/vizualizator.js', '/js/config.js', '/js/login-ascuns.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(COAJA.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chei) => Promise.all(chei.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // pozele de pe Worker/R2: le lasam in pace

  // Navigare in site: network-first (sa vezi mereu ultima versiune), iar
  // daca esti offline, servim din cache.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match(request).then((r) => r || caches.match('/index.html'))),
    );
    return;
  }

  // Restul fisierelor site-ului: stale-while-revalidate — servim din cache
  // instant (rapid, merge si offline), dar reincarcam in fundal, ca dupa un
  // deploy sa ai versiunea noua la urmatoarea vizita.
  e.respondWith(
    caches.match(request).then((rasp) => {
      const retea = fetch(request).then((net) => {
        const copie = net.clone();
        caches.open(CACHE).then((c) => c.put(request, copie)).catch(() => {});
        return net;
      }).catch(() => rasp);
      return rasp || retea;
    }),
  );
});
