import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');

const activeV302="const CACHE = 'lourex-invoice-v302';";
const activeV303="const CACHE = 'lourex-invoice-v303';\n// const CACHE = 'lourex-invoice-v302'; preserved as the immediate pre-v303 cache generation.";
if(sw.includes(activeV302))sw=sw.replace(activeV302,activeV303);
if(!sw.includes("const CACHE = 'lourex-invoice-v303';"))throw new Error('Unable to promote the LOUREX PWA cache to v303.');

const marker="LOCAL_CORE.push('./canonical-redirect.js');";
const visualRuntime="./visual-coherence-v303.css";
if(!sw.includes(visualRuntime)){
  if(!sw.includes(marker))throw new Error('Unable to locate the LOUREX PWA cache insertion point.');
  sw=sw.replace(marker,`LOCAL_CORE.push('${visualRuntime}');\n${marker}`);
}

await writeFile(swPath,sw);
console.log('[LOUREX PWA] v303 visual cache generation ready.');
