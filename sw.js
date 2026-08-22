/* ============================================================
   Service Worker

   アプリ本体（HTML・CSS・JS・地図ライブラリ）だけをキャッシュします。
   電波が無くても起動でき、登録済みの店を検索できます。

   ■ 絶対にキャッシュしないもの
     ・Places API への問い合わせ（古い結果を返すと事故のもと）
     ・OpenStreetMap のタイル画像（容量が膨らみ、利用規約にも配慮が要る）
     どちらも別ドメインなので、origin が違えば素通しにするだけで済みます。

   ■ 直したのに反映されないときは
     CACHE の版を上げてください。設定タブの
     「キャッシュを消して読み込み直す」でも直せます。
   ============================================================ */
const CACHE = 'meshi-v8';        // JSを変更したら必ずこの版を上げる（古い表示が配られ続けるため）

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './manifest.webmanifest',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './js/01-utils.js',
  './js/02-genres.js',
  './js/03-storage.js',
  './js/05-search.js',
  './js/06-router.js',
  './js/07-places.js',
  './js/10-find.js',
  './js/11-result.js',
  './js/12-map.js',
  './js/13-shop.js',
  './js/14-import.js',
  './js/15-settings.js',
  './js/16-share.js',
  './js/20-boot.js',
];

self.addEventListener('install', e => {
  /* 1つでも取れないと全部失敗するため、1件ずつ入れて失敗は見逃す */
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;   // API・地図タイルは素通し

  /* 共有シートから開かれたとき（?title=... 付き）は、
     キャッシュしてある入口をそのまま返す */
  if(url.search && url.pathname === self.location.pathname.replace(/sw\.js$/, '')){
    e.respondWith(caches.match('./index.html').then(r => r || fetch(req)));
    return;
  }

  /* まずキャッシュ、無ければ通信。取れたものは次回のために貯める */
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if(res && res.ok){
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
