const V = 'festa-facil-v10';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'estoque.js', 'vendas.js', 'relatorios.js', 'boot.js', 'cardapio.html', 'cardapio.js', 'manifest.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x))))); self.clients.claim(); });
// Rede primeiro (atualizações chegam na hora); sem internet, usa o cache
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(e.request, cp)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
