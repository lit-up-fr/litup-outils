// Service worker Lit uP Outils
// Stratégie : réseau d'abord, cache en secours (jamais de HTML périmé quand on est en ligne).
// Incrémenter CACHE_VERSION à chaque évolution notable des fichiers.
const CACHE_VERSION = "litup-outils-v53";

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
  // Fichier par fichier : avec addAll, un seul 404 fait échouer toute l'installation
  // et le service worker reste bloqué en « installing » à chaque ouverture.
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => null))))
      .catch(() => null)
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
      // Si le réseau échoue ET que le cache est vide, respondWith recevrait undefined :
      // la navigation part alors en erreur réseau, page blanche à l'appui. On rend
      // toujours une vraie réponse, quitte à ce qu'elle soit lisible plutôt que muette.
      .catch(() => caches.match(req, { ignoreSearch: true }).then((c) => c || (
        isDoc
          ? new Response(
              "<!doctype html><meta charset=utf-8><body style=\"font-family:system-ui;background:#0b0d12;color:#e2e8f0;padding:32px\">"
              + "<h2>Hors ligne</h2><p>Cette page n'est ni joignable sur le réseau ni disponible en cache.</p>"
              + "<p><a style=\"color:#00989D\" href=\"?secours=1\">Ouvrir en mode secours</a> une fois la connexion revenue.</p>",
              { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
            )
          : new Response("", { status: 504 })
      )))
  );
});
