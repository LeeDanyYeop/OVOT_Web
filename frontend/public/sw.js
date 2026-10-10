// OVOT service worker: app-shell caching only. API calls and WebSocket traffic are
// never cached, so location data always comes from the server. The shell (HTML + hashed
// JS/CSS) is precached so the installed app always opens and can show its reconnect
// screen even when the server or tunnel is unreachable.
const CACHE = 'ovot-shell-v27'
const STATIC = ['/logo.png', '/nfc-mark.png', '/guides/block3-datum.svg', '/manifest.webmanifest', '/app-icon/icon-192.png', '/app-icon/icon-512.png', '/app-icon/favicon-32.png', '/app-icon/favicon-64.png']

async function precache() {
  const cache = await caches.open(CACHE)
  const res = await fetch('/', { cache: 'no-store' })
  if (!res.ok) throw new Error('shell fetch failed')
  const html = await res.clone().text()
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
  await cache.put('/', res)
  await cache.addAll([...STATIC, ...assets])
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const OFFLINE_HTML = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OVOT</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#ffffff;color:#1d1d1f;font-family:sans-serif;text-align:center;padding:16px">
<div><p style="font-size:20px;font-weight:700">서버에 연결할 수 없습니다</p>
<p style="color:#6e6e73">모바일 데이터 연결과 PC 서버·터널 상태를 확인하세요.</p>
<button onclick="location.reload()" style="font-size:18px;padding:14px 24px;border-radius:980px;border:0;background:#1d1d1f;color:#fff;font-weight:700">다시 연결</button></div>
<script>addEventListener('online',()=>location.reload());setInterval(()=>fetch('/api/health',{cache:'no-store'}).then(r=>r.ok&&location.reload()).catch(()=>{}),10000)</script>`

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return

  if (req.mode === 'navigate') {
    // Network first so new deployments show up; keep the latest shell for offline use.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('/', copy))
          }
          return res
        })
        .catch(async () => {
          const cached = await caches.match('/')
          return cached || new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        }),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/app-icon/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})
