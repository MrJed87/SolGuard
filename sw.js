// SolGuard UV service worker: keeps the app shell available offline.
// Network first (so updates always arrive when online), falling back to the cache when the network fails
// or takes too long. Forecast/API requests are never cached: the app shows its own clear-sky fallback when offline.
const CACHE = "solguard-v0.7.0";
// How long to wait for the network before showing the cached copy (a weak signal can otherwise hang the page)
const NETWORK_WAIT_MS = 4000;
// "./" is the page itself. index.html is deliberately not listed: hosts with clean URLs answer it with a
// redirect, and a redirected response can't be used to answer a page navigation.
const SHELL = [
  "./",
  "manifest.webmanifest",
  "assets/tailwind.css?v=0.7.0",
  "assets/chart.umd.min.js",
  "assets/fonts/inter-latin-400-normal.woff2",
  "assets/fonts/inter-latin-500-normal.woff2",
  "assets/fonts/inter-latin-600-normal.woff2",
  "assets/fonts/inter-latin-700-normal.woff2",
  "assets/fonts/inter-latin-800-normal.woff2",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function cachedCopy(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  return req.mode === "navigate" ? caches.match("./") : undefined;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // APIs go straight to the network

  // The network request always runs to completion and refreshes the cache, even if the cached copy was
  // already shown because the network was slow.
  const fromNetwork = fetch(req);
  event.waitUntil(
    fromNetwork
      .then((res) => {
        if (!res.ok || res.redirected) return undefined;
        const copy = res.clone(); // taken straight away, before the page starts reading the response
        return caches.open(CACHE).then((c) => c.put(req, copy));
      })
      .catch(() => {})
  );

  event.respondWith((async () => {
    const cached = await cachedCopy(req);
    if (!cached) return fromNetwork.catch(() => Response.error());
    const slow = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_WAIT_MS));
    const fresh = await Promise.race([fromNetwork.catch(() => null), slow]);
    return fresh || cached;
  })());
});
