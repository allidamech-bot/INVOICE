import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');

/* v337 is the Safari/iPad document-scroll + printable-template reliability
   boundary. Force a genuinely new application cache so an installed PWA cannot
   retain the pre-fix v331 stylesheet or an older document-entry runtime. */
const RELEASE_GENERATION=337;
const activeCacheMatch=sw.match(/^const CACHE = 'lourex-invoice-v(\d+)';$/m);
const activeCacheGeneration=activeCacheMatch?Number(activeCacheMatch[1]):0;
if(activeCacheGeneration>0&&activeCacheGeneration<RELEASE_GENERATION){
  const marker=activeCacheMatch[0];
  sw=sw.replace(marker,`const CACHE = 'lourex-invoice-v${RELEASE_GENERATION}';\n// ${marker} preserved as the immediate pre-v${RELEASE_GENERATION} cache generation.`);
}else if(activeCacheGeneration<RELEASE_GENERATION){
  throw new Error(`Unable to promote the LOUREX PWA cache to v${RELEASE_GENERATION} or verify a newer cache generation.`);
}

const marker="LOCAL_CORE.push('./canonical-redirect.js');";
// Cache retained feature/reliability layers, TailAdmin visual owners, and the
// final document-scroll/template owners required by Safari/PWA offline startup.
// CacheStorage matches query strings by default, so these match production URLs.
const visualRuntimes=[
  './attachment-gallery-v304.css?v=304',
  './mobile-layout-closeout-v305.css?v=305',
  './release-hardening-v306.css?v=306',
  './styles/v309-draft-pin-stability.css?v=309',
  './styles/tailadmin-finance-v320.css?v=320-3',
  './styles/tailadmin-shell-v320.css?v=320-3',
  './styles/tailadmin-dashboard-v320.css?v=320-3',
  './styles/tailadmin-documents-v320.css?v=320-3',
  './styles/tailadmin-editor-frame-v320.css?v=320-2',
  './styles/tailadmin-editor-core-v320.css?v=320-2',
  './styles/tailadmin-attachments-v320.css?v=320-1',
  './styles/tailadmin-customers-v320.css?v=320-2',
  './styles/tailadmin-products-v320.css?v=320-2',
  './styles/tailadmin-finance-workspaces-v320.css?v=320-2',
  './styles/tailadmin-operations-v320.css?v=320-2',
  './styles/tailadmin-settings-v320.css?v=320-2',
  './styles/tailadmin-auth-v320.css?v=320-2',
  './styles/tailadmin-cloud-account-v320.css?v=320-2',
  './styles/tailadmin-ai-v320.css?v=320-2',
  './styles/tailadmin-overlays-v320.css?v=320-2',
  './styles/tailadmin-utilities-v320.css?v=320-1',
  './styles/tailadmin-visual-finish-v320.css?v=320-1',
  './styles/tailadmin-draft-finish-v320.css?v=320-1',
  './styles/tailadmin-ai-finish-v320.css?v=320-1',
  './styles/v333-critical-documents-visual-functional-closeout.css?v=333-1',
  './styles/v337-template-layout-balance.css?v=337-3',
  './styles/v331-draft-scroll-recovery.css?v=337-3',
  './styles/v332-critical-documents-deep-closeout.css?v=332-1',
  './styles/tailadmin-reliability-bridge-v320.css?v=320-2',
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

/* scripts/build.mjs intentionally collapses the source stylesheet stack into
   app.bundle.css. v331 must still exist as a standalone production owner because
   it is runtime-promoted after TailAdmin and because its leading @imports (v333 +
   v337) are only valid when v331 starts its own stylesheet. Restore that explicit
   owner after bundling instead of assuming the source <link> survived the build. */
if(!html.includes(draftScrollRuntime)){
  const bundleTag='<link rel="stylesheet" href="./styles/app.bundle.css" />';
  if(!html.includes(bundleTag))throw new Error('Unable to locate app.bundle.css while restoring the v337 Safari document-scroll owner.');
  const runtimeTag=`<link rel="stylesheet" href="${draftScrollRuntime}" data-lourex-v331-draft-recovery="true" />`;
  html=html.replace(bundleTag,`${bundleTag}\n  ${runtimeTag}`);
}

if(!html.includes(homeRuntime))throw new Error('Unable to verify the v320 presentation bootstrap in production HTML.');
if(!html.includes(documentRuntime))throw new Error('Unable to verify the v337 document runtime cache boundary in production HTML.');
if(!html.includes(draftScrollRuntime))throw new Error('Unable to verify the v337 Safari document-scroll owner in production HTML.');
if(!html.includes('data-lourex-v331-draft-recovery="true"'))throw new Error('Unable to verify the v337 document-scroll owner marker in production HTML.');
if(!html.includes(startupWatchdog))throw new Error('Unable to verify the v321 startup watchdog in production HTML.');
await writeFile(htmlPath,html);

/* public/document-entry-v302.js has a defensive stylesheet injector for unusual
   startup paths where the index marker is absent. Keep the historical source file
   untouched, but guarantee the production dist fallback uses the same cache-busted
   scroll owner as index.html. This avoids a mixed pre-337-3 runtime on Safari. */
const entryPath='dist/document-entry-v302.js';
let entry=await readFile(entryPath,'utf8');
for(const legacyStyle of ['./styles/v331-draft-scroll-recovery.css?v=331-1','./styles/v331-draft-scroll-recovery.css?v=336-1','./styles/v331-draft-scroll-recovery.css?v=337-2']){
  entry=entry.replaceAll(legacyStyle,draftScrollRuntime);
}
if(!entry.includes(draftScrollRuntime))throw new Error('Unable to verify the v337 scroll-owner fallback inside production document-entry runtime.');
if(/v331-draft-scroll-recovery\.css\?v=(?:331-1|336-1|337-2)/.test(entry))throw new Error('Stale pre-337-3 document scroll fallback survived production build.');
await writeFile(entryPath,entry);

console.log(`[LOUREX PWA] cache generation v${Math.max(activeCacheGeneration,RELEASE_GENERATION)} ready with v337-3 document scroll/template reliability + v321 startup recovery.`);
