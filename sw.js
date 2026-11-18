// Offline cache for the static app (GitHub Pages). Hashed build files are immutable, so they are served from
// the cache once fetched; the page itself is fetched fresh and falls back to the cached copy when offline.
// Data (Supabase, the agent server) is never cached: it is on another origin and always goes to the network.
const CACHE = "booking-v1";
const MAX_ASSETS = 80;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function trim(cache) {
  const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.includes("/assets/"));
  for (const r of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(r);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Network first: a new deploy shows up at once; offline, the last page seen still opens.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const fresh = await fetch(request);
          if (fresh.ok) await cache.put("./", fresh.clone());
          return fresh;
        } catch {
          return (await cache.match("./")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.includes("/assets/") || url.pathname.endsWith("/llms.txt")) {
    // Cache first for content-hashed files.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok && url.pathname.includes("/assets/")) {
          await cache.put(request, res.clone());
          void trim(cache);
        }
        return res;
      })(),
    );
  }
});
