import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');

/* v320 is a real visual-generation boundary. The previous cache must never keep
   retired v303/v307/v310/v311/canonical visual owners alive after deployment. */
const RELEASE_GENERATION=320;
const activeCacheMatch=sw.match(/^const CACHE = 'lourex-invoice-v(\d+)';$/m);
const activeCacheGeneration=activeCacheMatch?Number(activeCacheMatch[1]):0;
if(activeCacheGeneration>0&&activeCacheGeneration<RELEASE_GENERATION){
  const marker=activeCacheMatch[0];
  sw=sw.replace(marker,`const CACHE = 'lourex-invoice-v${RELEASE_GENERATION}';\n// ${marker} preserved as the immediate pre-v${RELEASE_GENERATION} cache generation.`);
}else if(activeCacheGeneration<RELEASE_GENERATION){
  throw new Error(`Unable to promote the LOUREX PWA cache to v${RELEASE_GENERATION} or verify a newer cache generation.`);
}

const marker="LOCAL_CORE.push('./canonical-redirect.js');";
// Cache only retained feature/reliability layers and the v320 visual owners.
// CacheStorage matches query strings by default, so these must match runtime URLs.
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
  './styles/tailadmin-reliability-bridge-v320.css?v=320-2',
  './home-final-closeout-v286.js?v=320',
  './document-entry-v302.js?v=320'
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
const documentRuntime='./document-entry-v302.js?v=320';
for(const legacyRuntime of ['./home-final-closeout-v286.js?v=314','./document-entry-v302.js?v=302','./document-entry-v302.js?v=311','./document-entry-v302.js?v=314']){
  if(!html.includes(legacyRuntime))continue;
  html=html.replace(legacyRuntime,legacyRuntime.includes('home-final')?homeRuntime:documentRuntime);
}
if(!html.includes(homeRuntime))throw new Error('Unable to verify the v320 presentation bootstrap in production HTML.');
if(!html.includes(documentRuntime))throw new Error('Unable to verify the v320 document runtime in production HTML.');
await writeFile(htmlPath,html);

console.log(`[LOUREX PWA] cache generation v${Math.max(activeCacheGeneration,RELEASE_GENERATION)} ready with v320 runtime set.`);
