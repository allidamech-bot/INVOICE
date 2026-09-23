import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');

const activeV302="const CACHE = 'lourex-invoice-v302';";
const activeV303="const CACHE = 'lourex-invoice-v303';";
const activeV304="const CACHE = 'lourex-invoice-v304';\n// const CACHE = 'lourex-invoice-v303'; preserved as the immediate pre-v304 cache generation.\n// const CACHE = 'lourex-invoice-v302'; preserved as the immediate pre-v303 cache generation.";
if(sw.includes(activeV302))sw=sw.replace(activeV302,activeV304);
else if(sw.includes(activeV303))sw=sw.replace(activeV303,activeV304);
if(!sw.includes("const CACHE = 'lourex-invoice-v304';"))throw new Error('Unable to promote the LOUREX PWA cache to v304.');

const marker="LOCAL_CORE.push('./canonical-redirect.js');";
const visualRuntimes=['./visual-coherence-v303.css','./attachment-gallery-v304.css'];
for(const visualRuntime of visualRuntimes){
  if(sw.includes(visualRuntime))continue;
  if(!sw.includes(marker))throw new Error('Unable to locate the LOUREX PWA cache insertion point.');
  sw=sw.replace(marker,`LOCAL_CORE.push('${visualRuntime}');\n${marker}`);
}

await writeFile(swPath,sw);
console.log('[LOUREX PWA] v304 attachment gallery cache generation ready.');
