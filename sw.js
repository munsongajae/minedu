// 오프라인에서도 앱 화면이 열리도록 파일을 저장해 둔다.
// 앱 파일을 고치면 CACHE 이름의 숫자를 올려야 기기에 새 버전이 들어간다.
const CACHE = 'block-studio-v17';
const ASSETS = [
  './',
  './index.html',
  './practice.html',
  './words.html',
  './css/style.css',
  './js/app.js',
  './js/storage.js',
  './js/world.js',
  './js/video.js',
  './js/recorder.js',
  './js/ai.js',
  './js/config.js',
  './js/pdf-import.js',
  './js/dictation.js',
  './js/speech.js',
  './js/cloud.js',
  './js/learn.js',
  './js/practice.js',
  './js/words.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !isFont) return;

  // 앱 파일: 먼저 인터넷에서 새로 받고, 안 되면 저장해 둔 것을 쓴다.
  // 글꼴: 저장해 둔 것을 먼저 쓴다.
  if (isFont) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    })));
    return;
  }
  // cache: 'no-cache' — 브라우저 캐시(GitHub Pages는 10분)에 묵은 파일이 있어도 서버에 새 버전이 있는지 꼭 확인한다.
  e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'))));
});
