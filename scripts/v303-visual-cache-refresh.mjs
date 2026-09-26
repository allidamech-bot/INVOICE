import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');

/* v351 changes the canonical visual stack, first-paint palette and PWA launch
   assets. Force a genuinely new application cache so an installed PWA cannot
   retain pre-v351 HTML, manifest, palette or runtime references. */
const RELEASE_GENERATION=351;
const activeCacheMatch=sw.match(/^const CACHE = 'lourex-invoice-v(\d+)';$/m);
const activeCacheGeneration=activeCacheMatch?Number(activeCacheMatch[1]):0;
if(activeCacheGeneration>0&&activeCacheGeneration<RELEASE_GENERATION){
  const marker=activeCacheMatch[0];
  sw=sw.replace(marker,`const CACHE = 'lourex-invoice-v${RELEASE_GENERATION}';\n// ${marker} preserved as the immediate pre-v${RELEASE_GENERATION} cache generation.`);
}else if(activeCacheGeneration<RELEASE_GENERATION){
  throw new Error(`Unable to promote the LOUREX PWA cache to v${RELEASE_GENERATION} or verify a newer cache generation.`);
}

const marker="LOCAL_CORE.push('./canonical-redirect.js');";
const themeBootstrap='./theme-bootstrap-v347.js?v=351';
const storageCleanup='./storage-cleanup-v347.js?v=351';
const mobilePreviewOutput='./mobile-preview-output-v350.js?v=350';
const homeRuntime='./home-final-closeout-v286.js?v=351';
const documentRuntime='./document-entry-v302.js?v=351';
const startupWatchdog='./startup-watchdog-v321.js?v=347';
const draftScrollRuntime='./styles/v331-draft-scroll-recovery.css?v=337-3';

/* app.bundle.css owns the application stack. Cache only standalone runtime
   owners/dependencies here; v304-v306 are compatibility stubs and stay omitted. */
const visualRuntimes=[
  './styles/v333-critical-documents-visual-functional-closeout.css?v=333-1',
  './styles/v337-template-layout-balance.css?v=337-3',
  draftScrollRuntime,
  './styles/v332-critical-documents-deep-closeout.css?v=332-1',
  themeBootstrap,
  storageCleanup,
  mobilePreviewOutput,
  homeRuntime,
  documentRuntime,
  startupWatchdog
];
for(const visualRuntime of visualRuntimes){
  if(sw.includes(`'${visualRuntime}'`)||sw.includes(`"${visualRuntime}"`))continue;
  if(!sw.includes(marker))throw new Error('Unable to locate the LOUREX PWA cache insertion point.');
  sw=sw.replace(marker,`LOCAL_CORE.push('${visualRuntime}');\n${marker}`);
}
await writeFile(swPath,sw);

const htmlPath='dist/index.html';
let html=await readFile(htmlPath,'utf8');
for(const [legacy,current] of [
  ['./home-final-closeout-v286.js?v=314',homeRuntime],
  ['./home-final-closeout-v286.js?v=320',homeRuntime],
  ['./document-entry-v302.js?v=302',documentRuntime],
  ['./document-entry-v302.js?v=311',documentRuntime],
  ['./document-entry-v302.js?v=314',documentRuntime],
  ['./document-entry-v302.js?v=320',documentRuntime],
  ['./document-entry-v302.js?v=337-2',documentRuntime],
  ['./document-entry-v302.js?v=337-3',documentRuntime],
  ['./startup-watchdog-v321.js?v=321',startupWatchdog],
  ['./storage-cleanup-v347.js?v=347',storageCleanup]
])html=html.replaceAll(legacy,current);
for(const legacyStyle of ['./styles/v331-draft-scroll-recovery.css?v=331-1','./styles/v331-draft-scroll-recovery.css?v=336-1','./styles/v331-draft-scroll-recovery.css?v=337-2'])html=html.replaceAll(legacyStyle,draftScrollRuntime);

/* scripts/build.mjs intentionally excludes v331 from app.bundle.css. v331 must
   remain standalone because its Safari document-scroll contract and CSS imports
   need to begin at a stylesheet boundary. */
if(!html.includes(draftScrollRuntime)){
  const bundleTag='<link rel="stylesheet" href="./styles/app.bundle.css" />';
  if(!html.includes(bundleTag))throw new Error('Unable to locate app.bundle.css while restoring the v337 Safari document-scroll owner.');
  const runtimeTag=`<link rel="stylesheet" href="${draftScrollRuntime}" data-lourex-v331-draft-recovery="true" />`;
  html=html.replace(bundleTag,`${bundleTag}\n  ${runtimeTag}`);
}

for(const asset of [themeBootstrap,storageCleanup,mobilePreviewOutput,homeRuntime,documentRuntime,startupWatchdog,draftScrollRuntime]){
  if(!html.includes(asset))throw new Error(`Unable to verify ${asset} in production HTML.`);
}
if(!html.includes('data-lourex-v331-draft-recovery="true"'))throw new Error('Unable to verify the v337 document-scroll owner marker in production HTML.');
await writeFile(htmlPath,html);

/* Normalize only the historical v331 fallback URLs inside document-entry. */
const entryPath='dist/document-entry-v302.js';
let entry=await readFile(entryPath,'utf8');
for(const legacyStyle of ['./styles/v331-draft-scroll-recovery.css?v=331-1','./styles/v331-draft-scroll-recovery.css?v=336-1','./styles/v331-draft-scroll-recovery.css?v=337-2'])entry=entry.replaceAll(legacyStyle,draftScrollRuntime);
if(!entry.includes(draftScrollRuntime))throw new Error('Unable to verify the v337 scroll-owner fallback inside production document-entry runtime.');
if(/v331-draft-scroll-recovery\.css\?v=(?:331-1|336-1|337-2)/.test(entry))throw new Error('Stale pre-337-3 document scroll fallback survived production build.');
await writeFile(entryPath,entry);

console.log(`[LOUREX PWA] cache generation v${Math.max(activeCacheGeneration,RELEASE_GENERATION)} ready with canonical v351 runtime refs and standalone v337 document owners.`);
