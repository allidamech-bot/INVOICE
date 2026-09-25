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

/* v337 is the final Safari/iPad document-scroll and template-layout cache boundary.
   This runs LAST in npm build, so no later build transform may silently restore the
   stale v331 stylesheet URL, pre-v337 document runtime, or pre-v337 PWA cache. */
if(!html.includes('./styles/v331-draft-scroll-recovery.css?v=337-2')){
  throw new Error('v337 production contract: repaired Safari document-scroll owner is missing from dist/index.html.');
}
if(html.includes('./styles/v331-draft-scroll-recovery.css?v=331-1')){
  throw new Error('v337 production contract: stale v331-1 document-scroll owner survived in dist/index.html.');
}
if(!html.includes('./document-entry-v302.js?v=337-2')){
  throw new Error('v337 production contract: cache-busted document runtime is missing from dist/index.html.');
}
if(/document-entry-v302\.js\?v=(?:302|311|314|320)/.test(html)){
  throw new Error('v337 production contract: stale document-entry runtime URL survived in dist/index.html.');
}
if(!documentRuntime.includes('./styles/v331-draft-scroll-recovery.css?v=337-2')){
  throw new Error('v337 production contract: document-entry fallback does not request the repaired Safari scroll owner.');
}
if(documentRuntime.includes('./styles/v331-draft-scroll-recovery.css?v=331-1')){
  throw new Error('v337 production contract: stale v331-1 fallback survived in dist/document-entry-v302.js.');
}
const cacheMatch=sw.match(/^const CACHE = 'lourex-invoice-v(\d+)';$/m);
const cacheGeneration=cacheMatch?Number(cacheMatch[1]):0;
if(cacheGeneration<337){
  throw new Error(`v337 production contract: PWA cache generation is ${cacheGeneration||'missing'}, expected >=337.`);
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

console.log(`LOUREX v321/v337 production runtime contract: PASS (PWA cache v${cacheGeneration}).`);
