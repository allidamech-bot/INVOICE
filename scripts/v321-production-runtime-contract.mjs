import {readFile,stat} from 'node:fs/promises';

const [html,documentRuntime,sw,draftOwner]=await Promise.all([
  readFile('dist/index.html','utf8'),
  readFile('dist/document-entry-v302.js','utf8'),
  readFile('dist/sw.js','utf8'),
  readFile('dist/styles/v331-draft-scroll-recovery.css','utf8')
]);

const forbiddenExternalRuntime=/https:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com)\/npm\/(?:react|react-dom)@/i;
if(forbiddenExternalRuntime.test(html))throw new Error('v351 production contract: external React/ReactDOM runtime survived the production build.');

for(const runtime of [
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
  './vendor/firebase-app-compat.js',
  './vendor/firebase-auth-compat.js',
  './vendor/firebase-firestore-compat.js'
])if(!html.includes(runtime))throw new Error(`v351 production contract: missing local runtime reference ${runtime}.`);

const startupWatchdog='./startup-watchdog-v321.js?v=347';
const themeBootstrap='./theme-bootstrap-v347.js?v=351';
const storageCleanup='./storage-cleanup-v347.js?v=351';
const presentationGuard='./home-final-closeout-v286.js?v=351';
const documentEntry='./document-entry-v302.js?v=351';
const draftPaintUrl='./styles/v333-critical-documents-visual-functional-closeout.css?v=333-1';
const draftOutputUrl='./styles/v337-template-layout-balance.css?v=337-3';
const recoveryUrl='./styles/v331-draft-scroll-recovery.css?v=337-3';
const criticalDocumentsUrl='./styles/v332-critical-documents-deep-closeout.css?v=332-1';
const recoveryMarker='data-lourex-v331-draft-recovery="true"';
const criticalDocumentsMarker='data-lourex-v332-critical-documents="true"';

for(const runtime of [startupWatchdog,themeBootstrap,storageCleanup,presentationGuard,documentEntry]){
  if(!html.includes(runtime))throw new Error(`v351 production contract: missing canonical runtime reference ${runtime}.`);
}

/* v331/v337 and v332 remain standalone document owners after the consolidated
   application bundle. This contract runs after normal precache generation and
   before the final idempotent startup verifier. */
const recoveryTags=[...html.matchAll(/<link\b[^>]*href=["']\.\/styles\/v331-draft-scroll-recovery\.css\?v=337-3["'][^>]*>/g)];
const criticalTags=[...html.matchAll(/<link\b[^>]*href=["']\.\/styles\/v332-critical-documents-deep-closeout\.css\?v=332-1["'][^>]*>/g)];
if(recoveryTags.length!==1)throw new Error(`v351 production contract: expected exactly one standalone document-scroll owner, found ${recoveryTags.length}.`);
if(criticalTags.length!==1)throw new Error(`v351 production contract: expected exactly one standalone critical-document owner, found ${criticalTags.length}.`);
const recoveryMarkerCount=(html.match(/data-lourex-v331-draft-recovery="true"/g)||[]).length;
const criticalMarkerCount=(html.match(/data-lourex-v332-critical-documents="true"/g)||[]).length;
if(recoveryMarkerCount!==1)throw new Error(`v351 production contract: expected exactly one document-scroll owner marker, found ${recoveryMarkerCount}.`);
if(criticalMarkerCount!==1)throw new Error(`v351 production contract: expected exactly one critical-document owner marker, found ${criticalMarkerCount}.`);
if(!html.includes(recoveryMarker)||!html.includes(criticalDocumentsMarker))throw new Error('v351 production contract: standalone document owner marker is missing from dist/index.html.');
const bundleIndex=html.indexOf('./styles/app.bundle.css');
const recoveryIndex=html.indexOf(recoveryUrl);
const criticalIndex=html.indexOf(criticalDocumentsUrl);
if(bundleIndex<0||recoveryIndex<=bundleIndex||criticalIndex<=recoveryIndex)throw new Error('v351 production contract: standalone document owners must load app.bundle.css -> v331 -> v332.');
if(/v331-draft-scroll-recovery\.css\?v=(?:331-1|336-1|337-2)/.test(html))throw new Error('v351 production contract: stale document-scroll owner survived in dist/index.html.');
if(!draftOwner.startsWith('@import url("./v333-critical-documents-visual-functional-closeout.css?v=333-1");\n@import url("./v337-template-layout-balance.css?v=337-3");'))throw new Error('v351 production contract: standalone v331 owner lost the v333/v337 import chain.');

if(/document-entry-v302\.js\?v=(?:302|311|314|320|337-2|337-3)/.test(html))throw new Error('v351 production contract: stale document-entry runtime URL survived in dist/index.html.');
if(!documentRuntime.includes(recoveryUrl))throw new Error('v351 production contract: document-entry fallback does not request the repaired Safari scroll owner.');
if(/v331-draft-scroll-recovery\.css\?v=(?:331-1|336-1|337-2)/.test(documentRuntime))throw new Error('v351 production contract: stale document-scroll fallback survived in dist/document-entry-v302.js.');
for(const retiredRuntimeStyle of ['attachment-gallery-v304.css','mobile-layout-closeout-v305.css','release-hardening-v306.css']){
  if(documentRuntime.includes(retiredRuntimeStyle))throw new Error(`v351 production contract: retired empty runtime stylesheet request survived: ${retiredRuntimeStyle}.`);
}

const cacheMatch=sw.match(/^const CACHE = 'lourex-invoice-v(\d+)';$/m);
const cacheGeneration=cacheMatch?Number(cacheMatch[1]):0;
if(cacheGeneration<351)throw new Error(`v351 production contract: PWA cache generation is ${cacheGeneration||'missing'}, expected >=351.`);

const staleServiceWorkerRuntime=/(?:document-entry-v302\.js\?v=(?:302|311|314|320|337-2|337-3)|v331-draft-scroll-recovery\.css\?v=(?:331-1|336-1|337-2)|storage-cleanup-v347\.js\?v=347|home-final-closeout-v286\.js\?v=320|startup-watchdog-v321\.js\?v=321)/;
if(staleServiceWorkerRuntime.test(sw))throw new Error('v351 production contract: stale active runtime URL survived in the service-worker precache.');

/* app.bundle.css owns all ordinary application styles. Only the dependencies
   imported by standalone v331 plus v331/v332 themselves may remain as explicit
   stylesheet pushes in the production Service Worker. Commented historical
   markers are intentionally ignored; only executable whole-line pushes count. */
const allowedStandaloneStylePushes=new Set([draftPaintUrl,draftOutputUrl,recoveryUrl,criticalDocumentsUrl]);
const activeStandaloneStylePushes=[...sw.matchAll(/^\s*LOCAL_CORE\.push\((['"])(\.\/styles\/[^'"\r\n]+\.css(?:\?[^'"\r\n]*)?)\1\);\s*$/gm)].map(match=>match[2]);
for(const style of activeStandaloneStylePushes){
  if(!allowedStandaloneStylePushes.has(style))throw new Error(`v351 production contract: historical stylesheet still precached outside app.bundle.css: ${style}.`);
}
for(const style of allowedStandaloneStylePushes){
  const occurrences=activeStandaloneStylePushes.filter(item=>item===style).length;
  if(occurrences!==1)throw new Error(`v351 production contract: expected exactly one active standalone stylesheet push for ${style}, found ${occurrences}.`);
}

for(const requiredAsset of [
  draftPaintUrl,
  draftOutputUrl,
  recoveryUrl,
  criticalDocumentsUrl,
  startupWatchdog,
  themeBootstrap,
  storageCleanup,
  presentationGuard,
  documentEntry
]){
  const occurrences=sw.split(requiredAsset).length-1;
  if(occurrences!==1)throw new Error(`v351 production contract: service worker expected exactly one active ${requiredAsset} reference, found ${occurrences}.`);
}

for(const file of [
  'dist/vendor/react.production.min.js',
  'dist/vendor/react-dom.production.min.js',
  'dist/startup-watchdog-v321.js',
  'dist/theme-bootstrap-v347.js',
  'dist/storage-cleanup-v347.js',
  'dist/home-final-closeout-v286.js',
  'dist/document-entry-v302.js',
  'dist/styles/v331-draft-scroll-recovery.css',
  'dist/styles/v332-critical-documents-deep-closeout.css',
  'dist/styles/v337-template-layout-balance.css'
]){
  const info=await stat(file);
  if(info.size<250)throw new Error(`v351 production contract: runtime file is unexpectedly small: ${file}.`);
}

console.log(`LOUREX v351 production runtime contract: PASS (PWA cache v${cacheGeneration}; canonical startup/storage refs; only four active standalone CSS precache pushes; standalone v331/v332 owners; no stale/retired runtime CSS requests).`);
