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
const visualRuntimes=['./visual-coherence-v303.css','./attachment-gallery-v304.css','./mobile-layout-closeout-v305.css','./release-hardening-v306.css','./loading-more-settings-v307.css','./styles/v308-document-studio.css','./styles/v309-draft-pin-stability.css','./styles/v310-stability-contrast.css','./styles/v311-quality-pass.css','./release-audit-v311.css'];
for(const visualRuntime of visualRuntimes){
  if(sw.includes(visualRuntime))continue;
  if(!sw.includes(marker))throw new Error('Unable to locate the LOUREX PWA cache insertion point.');
  sw=sw.replace(marker,`LOCAL_CORE.push('${visualRuntime}');\n${marker}`);
}

await writeFile(swPath,sw);
console.log('[LOUREX PWA] v311 quality cache generation ready.');
