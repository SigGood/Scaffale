// Scaffale: fa funzionare l'app anche senza rete (i dati sono già sul telefono).
// Quando aggiorni i file su GitHub, cambia il numero qui sotto.
const CACHE = 'scaffale-9';
// Copertine salvate sul telefono: cache a parte, che NON si svuota quando cambia CACHE.
const COVERS = 'scaffale-copertine';
const COVERS_MAX = 1500; // oltre questo numero si tolgono le copertine salvate da più tempo
const SHELL = ['./', './index.html', './style.css', './app.js', './cloud.js', './import.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== COVERS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Copertine: prima la copia salvata, altrimenti la rete (e la si salva per la prossima volta).
let saved = 0;
async function trimCovers(c) {
  const keys = await c.keys(); // in ordine di salvataggio: le prime sono le più vecchie
  await Promise.all(keys.slice(0, Math.max(0, keys.length - COVERS_MAX)).map((k) => c.delete(k)));
}
async function cover(req) {
  const c = await caches.open(COVERS);
  const hit = await c.match(req.url);
  if (hit) return hit;
  let res;
  try {
    // modalità "cors": se il sito lo permette sappiamo se l'immagine esiste davvero e occupa il suo spazio reale
    res = await fetch(req.url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) return res; // immagine inesistente: non la salviamo
  } catch (_) {
    // siti che non lo permettono (o rete assente): richiesta normale, come faceva prima l'app
    res = await fetch(req.url, { mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
  }
  c.put(req.url, res.clone()).then(() => { if (++saved % 25 === 0) return trimCovers(c); }).catch(() => {});
  return res;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) {
    if (e.request.destination === 'image' && url.protocol === 'https:') e.respondWith(cover(e.request).catch(() => Response.error()));
    return; // ricerche: sempre dalla rete
  }
  // prima la rete (così gli aggiornamenti arrivano subito), poi la copia salvata
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
