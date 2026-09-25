import {readFile,stat} from 'node:fs/promises';

const [html,documentRuntime,sw,draftOwner]=await Promise.all([
  readFile('dist/index.html','utf8'),
  readFile('dist/document-entry-v302.js','utf8'),
  readFile('dist/sw.js','utf8'),
  readFile('dist/styles/v331-draft-scroll-recovery.css','utf8')
]);

const forbiddenExternalRuntime=/https:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com)\/npm\/(?:react|react-dom)@/i;
if(forbiddenExternalRuntime.test(html)){
  throw new Error('v321 production contract: external React/ReactDOM runtime survived the production build.');
}

for(const runtime of [
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
  './vendor/firebase-app-compat.js',
  './vendor/firebase-auth-compat.js',
  './vendor/firebase-firestore-compat.js'
]){
  if(!html.includes(runtime))throw new Error(`v321 production contract: missing local runtime reference ${runtime}.`);
}

if(!html.includes('./startup-watchdog-v321.js?v=321')){
  throw new Error('v321 production contract: startup watchdog is missing from dist/index.html.');
}

/* v337-3 is the final Safari/iPad document-scroll and template-layout cache boundary.
   This runs LAST in npm build, so no later build transform may silently restore a
   stale stylesheet URL, pre-337-3 document runtime, or pre-v337 PWA cache. */
const recoveryUrl='./styles/v331-draft-scroll-recovery.css?v=337-3';
const recoveryMarker='data-lourex-v331-draft-recovery="true"';
const recoveryTags=[...html.matchAll(/<link\b[^>]*href=["']\.\/styles\/v331-draft-scroll-recovery\.css\?v=337-3["'][^>]*>/g)];
if(recoveryTags.length!==1){
  throw new Error(`v337-3 production contract: expected exactly one standalone document-scroll owner, found ${recoveryTags.length}.`);
}
const recoveryMarkerCount=(html.match(/data-lourex-v331-draft-recovery="true"/g)||[]).length;
if(recoveryMarkerCount!==1){
  throw new Error(`v337-3 production contract: expected exactly one document-scroll owner marker, found ${recoveryMarkerCount}.`);
}
if(!html.includes(recoveryUrl)){
  throw new Error('v337-3 production contract: repaired Safari document-scroll owner is missing from dist/index.html.');
}
if(!html.includes(recoveryMarker)){
  throw new Error('v337-3 production contract: standalone document-scroll owner marker is missing from dist/index.html.');
}
const bundleIndex=html.indexOf('./styles/app.bundle.css');
const recoveryIndex=html.indexOf(recoveryUrl);
if(bundleIndex<0||recoveryIndex<=bundleIndex){
  throw new Error('v337-3 production contract: standalone document-scroll owner must load after app.bundle.css.');
}
if(/v331-draft-scroll-recovery\.css\?v=(?:331-1|336-1|337-2)/.test(html)){
  throw new Error('v337-3 production contract: stale document-scroll owner survived in dist/index.html.');
}
if(!draftOwner.startsWith('@import url("./v333-critical-documents-visual-functional-closeout.css?v=333-1");\n@import url("./v337-template-layout-balance.css?v=337-3");')){
  throw new Error('v337-3 production contract: standalone v331 owner lost the v333/v337 import chain.');
}
if(!html.includes('./document-entry-v302.js?v=337-3')){
  throw new Error('v337-3 production contract: cache-busted document runtime is missing from dist/index.html.');
}
if(/document-entry-v302\.js\?v=(?:302|311|314|320|337-2)/.test(html)){
  throw new Error('v337-3 production contract: stale document-entry runtime URL survived in dist/index.html.');
}
if(!documentRuntime.includes(recoveryUrl)){
  throw new Error('v337-3 production contract: document-entry fallback does not request the repaired Safari scroll owner.');
}
if(/v331-draft-scroll-recovery\.css\?v=(?:331-1|336-1|337-2)/.test(documentRuntime)){
  throw new Error('v337-3 production contract: stale document-scroll fallback survived in dist/document-entry-v302.js.');
}
const cacheMatch=sw.match(/^const CACHE = 'lourex-invoice-v(\d+)';$/m);
const cacheGeneration=cacheMatch?Number(cacheMatch[1]):0;
if(cacheGeneration<337){
  throw new Error(`v337 production contract: PWA cache generation is ${cacheGeneration||'missing'}, expected >=337.`);
}

const staleServiceWorkerRuntime=/(?:document-entry-v302\.js\?v=(?:302|311|314|320|337-2)|v331-draft-scroll-recovery\.css\?v=(?:331-1|336-1|337-2))/;
if(staleServiceWorkerRuntime.test(sw)){
  throw new Error('v337-3 production contract: stale pre-337-3 runtime URL survived in the active service-worker precache.');
}

for(const requiredAsset of [
  './styles/v337-template-layout-balance.css?v=337-3',
  recoveryUrl,
  './document-entry-v302.js?v=337-3'
]){
  const occurrences=sw.split(requiredAsset).length-1;
  if(occurrences!==1)throw new Error(`v337-3 production contract: service worker expected exactly one active ${requiredAsset} reference, found ${occurrences}.`);
}

for(const file of [
  'dist/vendor/react.production.min.js',
  'dist/vendor/react-dom.production.min.js',
  'dist/startup-watchdog-v321.js',
  'dist/document-entry-v302.js',
  'dist/styles/v331-draft-scroll-recovery.css',
  'dist/styles/v337-template-layout-balance.css'
]){
  const info=await stat(file);
  if(info.size<500)throw new Error(`v321/v337 production contract: runtime file is unexpectedly small: ${file}.`);
}

console.log(`LOUREX v321/v337-3 production runtime contract: PASS (PWA cache v${cacheGeneration}; one standalone v331 owner; no stale active runtime URLs).`);