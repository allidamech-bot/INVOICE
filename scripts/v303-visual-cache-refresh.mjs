import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');

const generations=['302','303','304','305','306','307','308','309','310'];
let promoted=false;
for(const generation of generations){
  const marker=`const CACHE = 'lourex-invoice-v${generation}';`;
  if(!sw.includes(marker))continue;
  sw=sw.replace(marker,`const CACHE = 'lourex-invoice-v311';\n// const CACHE = 'lourex-invoice-v${generation}'; preserved as the immediate pre-v311 cache generation.`);
  promoted=true;
  break;
}
if(!promoted&&!sw.includes("const CACHE = 'lourex-invoice-v311';"))throw new Error('Unable to promote the LOUREX PWA cache to v311.');

const marker="LOCAL_CORE.push('./canonical-redirect.js');";
// Cache the exact URLs requested by index.html/document-entry-v302.js. CacheStorage
// matches query strings by default, so precaching an unversioned path would not
// satisfy a first offline request for the release-versioned URL.
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
  './document-entry-v302.js?v=311'
];
for(const visualRuntime of visualRuntimes){
  if(sw.includes(`'${visualRuntime}'`)||sw.includes(`"${visualRuntime}"`))continue;
  if(!sw.includes(marker))throw new Error('Unable to locate the LOUREX PWA cache insertion point.');
  sw=sw.replace(marker,`LOCAL_CORE.push('${visualRuntime}');\n${marker}`);
}
await writeFile(swPath,sw);

const htmlPath='dist/index.html';
let html=await readFile(htmlPath,'utf8');
const oldRuntime='./document-entry-v302.js?v=302';
const releaseRuntime='./document-entry-v302.js?v=311';
if(html.includes(oldRuntime))html=html.replace(oldRuntime,releaseRuntime);
else if(!html.includes(releaseRuntime))throw new Error('Unable to version the v311 document runtime in production HTML.');
await writeFile(htmlPath,html);

console.log('[LOUREX PWA] v311 quality cache generation ready.');
