import {readFile,stat} from 'node:fs/promises';

const [html,documentRuntime,sw]=await Promise.all([
  readFile('dist/index.html','utf8'),
  readFile('dist/document-entry-v302.js','utf8'),
  readFile('dist/sw.js','utf8')
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
if(!html.includes('./styles/v331-draft-scroll-recovery.css?v=337-3')){
  throw new Error('v337-3 production contract: repaired Safari document-scroll owner is missing from dist/index.html.');
}
if(!html.includes('data-lourex-v331-draft-recovery="true"')){
  throw new Error('v337-3 production contract: standalone document-scroll owner marker is missing from dist/index.html.');
}
const bundleIndex=html.indexOf('./styles/app.bundle.css');
const recoveryIndex=html.indexOf('./styles/v331-draft-scroll-recovery.css?v=337-3');
if(bundleIndex<0||recoveryIndex<=bundleIndex){
  throw new Error('v337-3 production contract: standalone document-scroll owner must load after app.bundle.css.');
}
if(/v331-draft-scroll-recovery\.css\?v=(?:331-1|336-1|337-2)/.test(html)){
  throw new Error('v337-3 production contract: stale document-scroll owner survived in dist/index.html.');
}
if(!html.includes('./document-entry-v302.js?v=337-3')){
  throw new Error('v337-3 production contract: cache-busted document runtime is missing from dist/index.html.');
}
if(/document-entry-v302\.js\?v=(?:302|311|314|320|337-2)/.test(html)){
  throw new Error('v337-3 production contract: stale document-entry runtime URL survived in dist/index.html.');
}
if(!documentRuntime.includes('./styles/v331-draft-scroll-recovery.css?v=337-3')){
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

for(const requiredAsset of [
  './styles/v337-template-layout-balance.css?v=337-3',
  './styles/v331-draft-scroll-recovery.css?v=337-3',
  './document-entry-v302.js?v=337-3'
]){
  if(!sw.includes(requiredAsset))throw new Error(`v337-3 production contract: service worker is missing ${requiredAsset}.`);
}

for(const file of [
  'dist/vendor/react.production.min.js',
  'dist/vendor/react-dom.production.min.js',
  'dist/startup-watchdog-v321.js',
  'dist/document-entry-v302.js'
]){
  const info=await stat(file);
  if(info.size<500)throw new Error(`v321/v337 production contract: runtime file is unexpectedly small: ${file}.`);
}

console.log(`LOUREX v321/v337-3 production runtime contract: PASS (PWA cache v${cacheGeneration}).`);
