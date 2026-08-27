// Service worker Lit uP Outils
// Stratégie : réseau d'abord, cache en secours (jamais de HTML périmé quand on est en ligne).
// Incrémenter CACHE_VERSION à chaque évolution notable des fichiers.
const CACHE_VERSION = "litup-outils-v3";

const PRECACHE = [
  "./",
  "./index.html",
  "./litup_ndf_salarie.html",
  "./litup_ndf_direction.html",
  "./litup_ndf_prestataire.html",
  "./litup_suivi_comptable_v6.html",
  "./litup_depenses_carte.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Cross-origin (Apps Script, fonts, CDN) : réseau direct, pas d'interception
  if (url.origin !== self.location.origin) return;

  // Les pages HTML sont toujours redemandées au réseau sans passer par le cache HTTP
  // (GitHub Pages autorise 10 min de cache navigateur : sinon une mise à jour n'apparaît pas tout de suite)
  const isDoc = req.destination === "document" || (req.headers.get("accept") || "").includes("text/html");
  e.respondWith(
    fetch(isDoc ? new Request(req, { cache: "no-store" }) : req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      // ignoreSearch : les pages ont historiquement des URLs ?v=XX
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
