// v48 logo cleanup refresh: force installed PWAs to receive the residual-backdrop repair module.
const CACHE = 'lourex-invoice-v48';
const LOCAL_CORE = ["./","./index.html","./styles/app.css","./styles/rtl.css","./styles/document.css","./styles/templates-modern.css","./styles/templates-dark.css","./styles/refinement.css","./styles/tablet-editor.css","./styles/premium.css","./styles/cloud.css","./styles/auth-entry.css","./styles/company-assets.css","./styles/system-polish.css","./styles/document-system.css","./styles/experience.css","./styles/accounting-polish.css","./styles/workflow-premium.css","./styles/smart-items.css","./styles/template-preferences.css","./styles/workflow-closeout.css","./styles/v44-audit.css","./styles/mobile-editor-fixes.css","./brand/lourex-logo.svg","./manifest.webmanifest","./src/app/index.js","./src/app/App.js","./src/app/AppErrorBoundary.js","./src/app/AuthScreenSelector.js","./src/components/UI.js","./src/components/AuthScreens.js","./src/components/AccountEntryScreen.js","./src/components/DocumentsPage.js","./src/components/CustomersPage.js","./src/components/SettingsModal.js","./src/components/EditorPage.js","./src/components/EditorPageCore.js","./src/components/DocumentReviewModal.js","./src/components/SavedItemsModal.js","./src/components/CloudAccountModal.js","./src/cloud/firebase.js","./src/cloud/freshness.js","./src/templates/TemplateRenderer.js","./src/templates/TemplateThumbnails.js","./src/types.js","./src/lib/defaults.js","./src/lib/i18n.js","./src/lib/id.js","./src/lib/money.js","./src/lib/documents.js","./src/lib/readiness.js","./src/lib/document-quality.js","./src/lib/saved-items.js","./src/lib/appearance.js","./src/lib/backup.js","./src/lib/files.js","./src/lib/logo-repair.js","./src/crypto/crypto.js","./src/storage/db.js","./src/storage/session.js","./src/storage/vault.js","./src/storage/vault-merge.js"];
const EXTERNAL_CORE = ["https://cdn.jsdelivr.net/npm/react@17.0.2/umd/react.production.min.js","https://cdn.jsdelivr.net/npm/react-dom@17.0.2/umd/react-dom.production.min.js"];
const EXTERNAL_CORE_SET = new Set(EXTERNAL_CORE);

async function preserveExternalRuntime(cache,asset){
  // Reuse a previously cached runtime before going to the network. This makes
  // an app upgrade safe even when the new service worker installs on a weak or
  // intermittent connection and the previous version already worked offline.
  const existing=await caches.match(asset);
  if(existing){await cache.put(asset,existing.clone());return;}
  try{
    const response=await fetch(asset);
    if(response.ok)await cache.put(asset,response.clone());
  }catch{}
}

self.addEventListener('install', event => event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(LOCAL_CORE);
  await Promise.all(EXTERNAL_CORE.map(asset=>preserveExternalRuntime(cache,asset)));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    if (!EXTERNAL_CORE_SET.has(url.href)) return;
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone())).catch(()=>undefined);
      return response;
    })));
    return;
  }
  if (url.pathname.endsWith('/runtime-config.js')) {
    event.respondWith(fetch(event.request,{cache:'no-store'}));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone())).catch(()=>undefined);
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : new Response('', { status: 504, statusText: 'Offline' }))));
});
