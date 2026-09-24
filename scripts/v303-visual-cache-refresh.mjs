import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');

const RELEASE_GENERATION=314;
const activeCacheMatch=sw.match(/^const CACHE = 'lourex-invoice-v(\d+)';$/m);
const activeCacheGeneration=activeCacheMatch?Number(activeCacheMatch[1]):0;
if(activeCacheGeneration>0&&activeCacheGeneration<RELEASE_GENERATION){
  const marker=activeCacheMatch[0];
  sw=sw.replace(marker,`const CACHE = 'lourex-invoice-v${RELEASE_GENERATION}';\n// ${marker} preserved as the immediate pre-v${RELEASE_GENERATION} cache generation.`);
}else if(activeCacheGeneration<RELEASE_GENERATION){
  throw new Error(`Unable to promote the LOUREX PWA cache to v${RELEASE_GENERATION} or verify a newer cache generation.`);
}

const marker="LOCAL_CORE.push('./canonical-redirect.js');";
// Cache the exact URLs requested by index.html. CacheStorage matches query strings
// by default, so release-versioned runtime/CSS URLs must be precached verbatim.
const visualRuntimes=[
  './visual-coherence-v303.css?v=303',
  './attachment-gallery-v304.css?v=304',
  './mobile-layout-closeout-v305.css?v=305',
  './release-hardening-v306.css?v=306',
  './loading-more-settings-v307.css?v=307',
  './styles/v308-document-studio.css?v=308',
  './styles/v309-draft-pin-stability.css?v=309',
  './styles/v310-stability-contrast.css?v=310',
  './styles/v311-quality-pass.css?v=311',
  './release-audit-v311.css?v=311',
  './styles/home-canonical-v314.css?v=314',
  './styles/shell-canonical-v314.css?v=314',
  './styles/documents-canonical-v314.css?v=314',
  './styles/editor-canonical-v314.css?v=314',
  './styles/customers-canonical-v314.css?v=314',
  './styles/products-canonical-v314.css?v=314',
  './styles/operations-canonical-v314.css?v=314',
  './styles/finance-canonical-v314.css?v=314',
  './styles/reports-canonical-v314.css?v=314',
  './styles/settings-canonical-v314.css?v=314',
  './styles/auth-canonical-v314.css?v=314',
  './styles/overlays-canonical-v314.css?v=314',
  './home-final-closeout-v286.js?v=314',
  './document-entry-v302.js?v=314'
];
for(const visualRuntime of visualRuntimes){
  if(sw.includes(`'${visualRuntime}'`)||sw.includes(`"${visualRuntime}"`))continue;
  if(!sw.includes(marker))throw new Error('Unable to locate the LOUREX PWA cache insertion point.');
  sw=sw.replace(marker,`LOCAL_CORE.push('${visualRuntime}');\n${marker}`);
}
await writeFile(swPath,sw);

const htmlPath='dist/index.html';
let html=await readFile(htmlPath,'utf8');
const releaseRuntime='./document-entry-v302.js?v=314';
for(const legacyRuntime of ['./document-entry-v302.js?v=302','./document-entry-v302.js?v=311']){
  if(html.includes(legacyRuntime))html=html.replace(legacyRuntime,releaseRuntime);
}
if(!html.includes(releaseRuntime))throw new Error('Unable to verify the v314 document runtime in production HTML.');
if(!html.includes('./home-final-closeout-v286.js?v=314'))throw new Error('Unable to verify the v314 Home runtime in production HTML.');
await writeFile(htmlPath,html);

console.log(`[LOUREX PWA] cache generation v${Math.max(activeCacheGeneration,RELEASE_GENERATION)} ready with v314 runtime set.`);
