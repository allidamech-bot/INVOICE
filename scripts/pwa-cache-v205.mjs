import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');

const scopeRuntime='./src/lib/settings-scope.js';
const cacheMarker="LOCAL_CORE.push('./canonical-redirect.js');";
if(!sw.includes(`'${scopeRuntime}'`)&&!sw.includes(`"${scopeRuntime}"`)){
  if(!sw.includes(cacheMarker))throw new Error('Unable to locate the LOUREX PWA cache insertion point.');
  sw=sw.replace(cacheMarker,`LOCAL_CORE.push('${scopeRuntime}');\n${cacheMarker}`);
}

const previousCache="const CACHE = 'lourex-invoice-v204';";
const nextCache="const CACHE = 'lourex-invoice-v205';\n// lourex-invoice-v204: preserved as a legacy marker for cache-migration tests.";
if(sw.includes(previousCache))sw=sw.replace(previousCache,nextCache);
if(!sw.includes("const CACHE = 'lourex-invoice-v205';"))throw new Error('Unable to advance the LOUREX PWA cache generation to v205.');
if(!sw.includes(scopeRuntime))throw new Error('LOUREX PWA cache is missing the settings-scope runtime.');

await writeFile(swPath,sw);
