const CACHE = 'lourex-invoice-v4';
const CORE = ["./","./index.html","./styles/app.css","./styles/document.css","./brand/lourex-logo.svg","./manifest.webmanifest","./src/app/index.js","./src/app/App.js","./src/app/AuthScreenSelector.js","./src/components/UI.js","./src/components/AuthScreens.js","./src/components/DocumentsPage.js","./src/components/CustomersPage.js","./src/components/SettingsModal.js","./src/components/EditorPage.js","./src/templates/TemplateRenderer.js","./src/templates/TemplateThumbnails.js","./src/types.js","./src/lib/defaults.js","./src/lib/id.js","./src/lib/money.js","./src/lib/documents.js","./src/lib/backup.js","./src/lib/files.js","./src/crypto/crypto.js","./src/storage/db.js","./src/storage/vault.js"];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && new URL(event.request.url).origin === self.location.origin) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : new Response('', { status: 504, statusText: 'Offline' }))));
});
