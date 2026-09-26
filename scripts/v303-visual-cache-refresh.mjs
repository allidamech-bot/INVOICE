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
/* v351: app.bundle.css is already part of the application core. Do not precache
   every TailAdmin source stylesheet a second time. Cache only CSS/JS that remains
   a real standalone runtime owner or a dependency of one. The retired v304-v306
   attachment CSS paths are compatibility stubs and are intentionally omitted. */
const visualRuntimes=[
  './styles/v333-critical-documents-visual-functional-closeout.css?v=333-1',
  './styles/v337-template-layout-balance.css?v=337-3',
  './styles/v331-draft-scroll-recovery.css?v=337-3',
  './styles/v332-critical-documents-deep-closeout.css?v=332-1',
  './home-final-closeout-v286.js?v=320',
  './document-entry-v302.js?v=337-3',
  './startup-watchdog-v321.js?v=321'
];
for(const visualRuntime of visualRuntimes){
  if(sw.includes(`'${visualRuntime}'`)||sw.includes(`"${visualRuntime}"`))continue;
  if(!sw.includes(marker))throw new Error('Unable to locate the LOUREX PWA cache insertion point.');
  sw=sw.replace(marker,`LOCAL_CORE.push('${visualRuntime}');\n${marker}`);
}
await writeFile(swPath,sw);

const htmlPath='dist/index.html';
let html=await readFile(htmlPath,'utf8');
const homeRuntime='./home-final-closeout-v286.js?v=320';
const documentRuntime='./document-entry-v302.js?v=337-3';
const draftScrollRuntime='./styles/v331-draft-scroll-recovery.css?v=337-3';
const startupWatchdog='./startup-watchdog-v321.js?v=321';
for(const legacyRuntime of ['./home-final-closeout-v286.js?v=314','./document-entry-v302.js?v=302','./document-entry-v302.js?v=311','./document-entry-v302.js?v=314','./document-entry-v302.js?v=320','./document-entry-v302.js?v=337-2']){
  if(!html.includes(legacyRuntime))continue;
  html=html.replace(legacyRuntime,legacyRuntime.includes('home-final')?homeRuntime:documentRuntime);
}
for(const legacyStyle of ['./styles/v331-draft-scroll-recovery.css?v=331-1','./styles/v331-draft-scroll-recovery.css?v=336-1','./styles/v331-draft-scroll-recovery.css?v=337-2']){
  if(html.includes(legacyStyle))html=html.replace(legacyStyle,draftScrollRuntime);
}

/* scripts/build.mjs intentionally excludes v331 from app.bundle.css. v331 must
   remain a standalone production owner because it carries the Safari document
   scroll contract and its v333/v337 imports must start a stylesheet. Restore the
   explicit owner after bundling. */
if(!html.includes(draftScrollRuntime)){
  const bundleTag='<link rel="stylesheet" href="./styles/app.bundle.css" />';
  if(!html.includes(bundleTag))throw new Error('Unable to locate app.bundle.css while restoring the v337 Safari document-scroll owner.');
  const runtimeTag=`<link rel="stylesheet" href="${draftScrollRuntime}" data-lourex-v331-draft-recovery="true" />`;
  html=html.replace(bundleTag,`${bundleTag}\n  ${runtimeTag}`);
}

if(!html.includes(homeRuntime))throw new Error('Unable to verify the v320 presentation guard in production HTML.');
if(!html.includes(documentRuntime))throw new Error('Unable to verify the v337 document runtime cache boundary in production HTML.');
if(!html.includes(draftScrollRuntime))throw new Error('Unable to verify the v337 Safari document-scroll owner in production HTML.');
if(!html.includes('data-lourex-v331-draft-recovery="true"'))throw new Error('Unable to verify the v337 document-scroll owner marker in production HTML.');
if(!html.includes(startupWatchdog))throw new Error('Unable to verify the v321 startup watchdog in production HTML.');
await writeFile(htmlPath,html);

/* document-entry-v302.js already requests the current v337-3 owner in source.
   Keep this production migration guard anyway: older copied/build-cache variants
   must be normalized before release so no unusual Safari/PWA startup path can
   reintroduce a stale 331-1/336-1/337-2 stylesheet URL. */
const entryPath='dist/document-entry-v302.js';
let entry=await readFile(entryPath,'utf8');
for(const legacyStyle of ['./styles/v331-draft-scroll-recovery.css?v=331-1','./styles/v331-draft-scroll-recovery.css?v=336-1','./styles/v331-draft-scroll-recovery.css?v=337-2']){
  entry=entry.replaceAll(legacyStyle,draftScrollRuntime);
}
if(!entry.includes(draftScrollRuntime))throw new Error('Unable to verify the v337 scroll-owner fallback inside production document-entry runtime.');
if(/v331-draft-scroll-recovery\.css\?v=(?:331-1|336-1|337-2)/.test(entry))throw new Error('Stale pre-337-3 document scroll fallback survived production build.');
await writeFile(entryPath,entry);

console.log(`[LOUREX PWA] cache generation v${Math.max(activeCacheGeneration,RELEASE_GENERATION)} ready with the v351 single bundled app stack plus standalone v337 document owners.`);
