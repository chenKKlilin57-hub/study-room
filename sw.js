const CACHE_NAME = "zixishi-v3";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./app.html",
  "./js/main.js?v=8",
  "./js/timer.js",
  "./js/auth.js",
  "./js/config.js",
  "./js/heatmap.js",
  "./js/tasks.js",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 网络优先，离线回退缓存
self.addEventListener("fetch", event => {
  // 只处理 GET 请求，跳过 Supabase API 请求
  if (event.request.method !== "GET") return;
  if (event.request.url.includes("supabase.co")) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
