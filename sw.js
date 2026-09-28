const V = 'marizekids-v20';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'estoque.js', 'vendas.js', 'relatorios.js', 'config.js', 'nuvem.js', 'entregas.js', 'boot.js', 'cardapio.html', 'cardapio.js', 'loja.html', 'loja.js', 'pix.js', 'manifest.json', 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x))))); self.clients.claim(); });
// Rede primeiro (atualizações chegam na hora); sem internet, usa o cache
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Dados do Supabase nunca vêm do cache (sempre a versão atual)
  const u = new URL(e.request.url);
  if (u.origin !== location.origin && u.hostname !== 'cdn.jsdelivr.net') return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(e.request, cp)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
