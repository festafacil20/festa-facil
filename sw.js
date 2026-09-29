const V = 'marizekids-v22';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'estoque.js', 'vendas.js', 'relatorios.js', 'config.js', 'nuvem.js', 'entregas.js', 'boot.js', 'cardapio.html', 'cardapio.js', 'loja.html', 'loja.js', 'pix.js', 'manifest.json', 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x))))); self.clients.claim(); });
// Rede primeiro (atualizações chegam na hora); sem internet, usa o cache
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Dados do Supabase nunca vêm do cache (sempre a versão atual)
  const u = new URL(e.request.url);
  if (u.origin !== location.origin && u.hostname !== 'cdn.jsdelivr.net') return;
  // arquivos do próprio app: sempre confere no servidor (senão o navegador segura a versão antiga por até 10 min)
  e.respondWith(fetch(e.request, u.origin === location.origin ? { cache: 'no-cache' } : {}).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(e.request, cp)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
// Notificação de novo pedido (enviada pela função notificar-pedido)
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(d.title || 'Marize Kids', { body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || 'pedido', renotify: true, vibrate: [200, 100, 200], data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data.url || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    const w = ws.find(x => x.url.startsWith(self.registration.scope));
    return w ? w.focus().then(c => c.navigate(url)) : clients.openWindow(url);
  }));
});
