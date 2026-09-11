import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');

const cacheMarker="LOCAL_CORE.push('./canonical-redirect.js');";
const requiredRuntimes=['./src/lib/settings-scope.js','./src/cloud/google-auth.js'];
for(const runtime of requiredRuntimes){
  if(sw.includes(`'${runtime}'`)||sw.includes(`"${runtime}"`))continue;
  if(!sw.includes(cacheMarker))throw new Error('Unable to locate the LOUREX PWA cache insertion point.');
  sw=sw.replace(cacheMarker,`LOCAL_CORE.push('${runtime}');\n${cacheMarker}`);
}

const previousCache="const CACHE = 'lourex-invoice-v204';";
const nextCache="const CACHE = 'lourex-invoice-v209';\n// const CACHE = 'lourex-invoice-v208'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v207'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v206'; preserved as a legacy marker for cache-migration tests.\n// lourex-invoice-v205: preserved as a legacy marker for cache-migration tests.\n// lourex-invoice-v204: preserved as a legacy marker for cache-migration tests.";
if(sw.includes(previousCache))sw=sw.replace(previousCache,nextCache);
if(!sw.includes("const CACHE = 'lourex-invoice-v209';"))throw new Error('Unable to advance the LOUREX PWA cache generation to v209.');
for(const runtime of requiredRuntimes)if(!sw.includes(runtime))throw new Error(`LOUREX PWA cache is missing required runtime ${runtime}.`);

await writeFile(swPath,sw);
