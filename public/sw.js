const CACHE = 'lourex-invoice-v7';
const CORE = ["./","./index.html","./styles/app.css","./styles/rtl.css","./styles/document.css","./styles/refinement.css","./brand/lourex-logo.svg","./manifest.webmanifest","./src/app/index.js","./src/app/App.js","./src/app/AuthScreenSelector.js","./src/components/UI.js","./src/components/AuthScreens.js","./src/components/DocumentsPage.js","./src/components/CustomersPage.js","./src/components/SettingsModal.js","./src/components/EditorPage.js","./src/templates/TemplateRenderer.js","./src/templates/TemplateThumbnails.js","./src/types.js","./src/lib/defaults.js","./src/lib/i18n.js","./src/lib/id.js","./src/lib/money.js","./src/lib/documents.js","./src/lib/backup.js","./src/lib/files.js","./src/crypto/crypto.js","./src/storage/db.js","./src/storage/session.js","./src/storage/vault.js","https://cdn.jsdelivr.net/npm/react@16.0.0/umd/react.production.min.js","https://cdn.jsdelivr.net/npm/react-dom@16.0.1/umd/react-dom.production.min.js"];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok || response.type === 'opaque') caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : new Response('', { status: 504, statusText: 'Offline' }))));
});
