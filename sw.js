const CACHE_NAME = "zixishi-v6";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./app.html",
  "./js/supabase-js.umd.js?v=1",
  "./js/main.js?v=11",
  "./js/timer.js?v=6",
  "./js/auth.js?v=2",
  "./js/config.js?v=2",
  "./js/heatmap.js?v=2",
  "./js/tasks.js?v=2",
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
