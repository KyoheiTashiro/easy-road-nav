// app shell を Cache Storage から即返す。tailscale serve は Cache-Control を付けないので、
// SW なしだと毎起動 Tailscale トンネル復帰 + TLS + HTML 取得を待って数秒白画面になる。
const CACHE = "shell";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll(
          ["/", "/icon.png", "/manifest.json"].map(
            (u) => new Request(u, { cache: "no-cache" }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/gh/")) return;
  // URL 共有はクエリ形式なので、どの navigate も同じ "/" を返す
  const key = e.request.mode === "navigate" ? "/" : e.request;
  // no-store 要求にキャッシュを返すと新版を検知できない
  if (e.request.cache === "no-store")
    return e.respondWith(caches.open(CACHE).then((c) => fetchAndPut(c, key)));
  e.respondWith(
    url.pathname.startsWith("/assets/")
      ? cacheFirst(key)
      : staleWhileRevalidate(key, e),
  );
});

// hash 付きファイル名は内容が変わらない
async function cacheFirst(key) {
  const c = await caches.open(CACHE);
  return (await c.match(key)) ?? fetchAndPut(c, key);
}

// 旧版を即返し、裏で取り直す。新版は次回起動から
// ponytail: 旧 /assets/* は消さず残る（デプロイ毎 ~1.4 MB）。容量が気になったら navigate 時に新 HTML が参照しないものを削除
async function staleWhileRevalidate(key, e) {
  const c = await caches.open(CACHE);
  const hit = await c.match(key);
  const fresh = fetchAndPut(c, key);
  if (!hit) return fresh;
  e.waitUntil(fresh.catch(() => {}));
  return hit;
}

// tailscale serve は Cache-Control を付けず、HTTP キャッシュが heuristic で旧版を返し続けるので毎回再検証する
async function fetchAndPut(c, key) {
  const r = await fetch(key, { cache: "no-cache" });
  if (r.ok) await c.put(key, r.clone());
  return r;
}
