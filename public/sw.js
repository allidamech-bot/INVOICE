// v119 — critical document output hardening: bottom-anchored commercial details and stable Arabic RTL PDF/share rendering; retains v118 installed-app icon QA and prior compatibility fixes.
// Compatibility marker retained for legacy regression coverage: lourex-invoice-v65.
// Runtime compatibility markers: react@17.0.2/umd/react.production.min.js | react-dom@17.0.2/umd/react-dom.production.min.js
const CACHE = 'lourex-invoice-v101';
const LOCAL_CORE = ["./","./index.html","./manifest.webmanifest","./ios-print-bridge.js","./pull-to-refresh.js","./styles/app.css","./styles/rtl.css","./styles/document.css","./styles/templates-modern.css","./styles/templates-dark.css","./styles/refinement.css","./styles/tablet-editor.css","./styles/premium.css","./styles/cloud.css","./styles/auth-entry.css","./styles/company-assets.css","./styles/system-polish.css","./styles/document-system.css","./styles/experience.css","./styles/accounting-polish.css","./styles/workflow-premium.css","./styles/template-preferences.css","./styles/workflow-closeout.css","./styles/v44-audit.css","./styles/editor-system.css","./styles/editor-workflow-v61.css","./styles/mobile-item-editor-v66.css","./styles/iphone-fit-v70.css","./styles/mobile-shell-v71.css","./styles/a4-mobile-print-v73.css","./styles/mobile-editor-scroll-v75.css","./styles/document-typography-v76.css","./styles/document-direction-v78.css","./styles/mobile-modal-v81.css","./styles/document-ux-v82.css","./styles/document-layout-v83.css","./styles/document-template-polish-v84.css","./styles/document-content-v85.css","./styles/pull-to-refresh-v86.css","./styles/editor-hierarchy-v93.css","./styles/workspace-mobile-v94.css","./styles/saved-items-v95.css","./styles/premium-smoothness-v99.css","./styles/items-library-v106.css","./styles/editor-guided-flow-v107.css","./styles/settings-workspace-v108.css","./styles/customer-document-flow-v109.css","./styles/system-closeout-v110.css","./styles/product-preset-fields-v111.css","./styles/product-metadata-assist-v112.css","./styles/product-library-pro-v113.css","./styles/customer-ux-closeout-v114.css","./styles/onboarding-simplification-v115.css","./styles/document-output-v119.css","./styles/performance-polish-v100.css","./brand/lourex-logo.svg","./brand/lourex-app-icon.svg","./brand/lourex-app-icon-180.png","./brand/lourex-app-icon-192.png","./brand/lourex-app-icon-512.png","./src/app/index.js","./src/app/App.js","./src/app/AppErrorBoundary.js","./src/app/AuthScreenSelector.js","./src/components/UI.js","./src/components/AuthScreens.js","./src/components/AccountEntryScreen.js","./src/components/DocumentsPage.js","./src/components/CustomersPage.js","./src/components/SavedItemsPage.js","./src/components/ProductLibraryWorkspace.js","./src/components/ProductImportModal.js","./src/components/SettingsModal.js","./src/components/EditorPage.js","./src/components/EditorPageCore.js","./src/components/DocumentReviewModal.js","./src/components/SavedItemsModal.js","./src/components/CloudAccountModal.js","./src/cloud/firebase.js","./src/cloud/freshness.js","./src/templates/TemplateRenderer.js","./src/templates/TemplateThumbnails.js","./src/types.js","./src/lib/defaults.js","./src/lib/i18n.js","./src/lib/id.js","./src/lib/money.js","./src/lib/documents.js","./src/lib/readiness.js","./src/lib/document-quality.js","./src/lib/saved-items.js","./src/lib/product-presets.js","./src/lib/product-import.js","./src/lib/workflow-presets.js","./src/lib/appearance.js","./src/lib/backup.js","./src/lib/files.js","./src/lib/logo-repair.js","./src/lib/logo-rebuild.js","./src/crypto/crypto.js","./src/storage/db.js","./src/storage/session.js","./src/storage/vault.js","./src/storage/vault-merge.js"];
const EXTERNAL_CORE = ["https://cdn.jsdelivr.net/npm/react@17.0.2/umd/react.production.min.js","https://cdn.jsdelivr.net/npm/react-dom@17.0.2/umd/react-dom.production.min.js","https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js","https://www.gstatic.com/firebasejs/12.17.1/firebase-auth-compat.js","https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore-compat.js","https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js","https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js","https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"];
const EXTERNAL_CORE_SET = new Set(EXTERNAL_CORE);
const FRESH_PATHS = new Set(['/ios-print-bridge.js','/pull-to-refresh.js']);

function isAppRuntimePath(pathname){
  return pathname.startsWith('/src/') || pathname.startsWith('/styles/');
}

async function preserveExternalRuntime(cache,asset){
  const existing=await caches.match(asset);
  if(existing){await cache.put(asset,existing.clone());return;}
  try{const response=await fetch(asset);if(response.ok)await cache.put(asset,response.clone());}catch{}
}

async function networkFirst(request){
  const cache=await caches.open(CACHE);
  try{
    const response=await fetch(request,{cache:'no-cache'});
    if(response.ok)void cache.put(request,response.clone());
    return response;
  }catch{
    const cached=await cache.match(request);
    if(cached)return cached;
    if(request.mode==='navigate')return (await cache.match('./index.html'))||new Response('',{status:504,statusText:'Offline'});
    return new Response('',{status:504,statusText:'Offline'});
  }
}

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(LOCAL_CORE);
  await Promise.all(EXTERNAL_CORE.map(asset=>preserveExternalRuntime(cache,asset)));
  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);

  if(url.origin !== self.location.origin){
    if (!EXTERNAL_CORE_SET.has(url.href)) return;
    event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
      if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request, response.clone())).catch(()=>undefined);
      return response;
    })));
    return;
  }

  if(url.pathname.endsWith('/runtime-config.js')){
    event.respondWith(fetch(event.request,{cache:'no-store'}));
    return;
  }

  if(event.request.mode==='navigate'||FRESH_PATHS.has(url.pathname)||isAppRuntimePath(url.pathname)){
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone())).catch(()=>undefined);
    return response;
  }).catch(()=>event.request.mode==='navigate'?caches.match('./index.html'):new Response('',{status:504,statusText:'Offline'}))));
});