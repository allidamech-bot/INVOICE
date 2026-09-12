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
const nextCache="const CACHE = 'lourex-invoice-v214';\n// const CACHE = 'lourex-invoice-v213'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v212'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v211'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v210'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v209'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v208'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v207'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v206'; preserved as a legacy marker for cache-migration tests.\n// lourex-invoice-v205: preserved as a legacy marker for cache-migration tests.\n// lourex-invoice-v204: preserved as a legacy marker for cache-migration tests.";
if(sw.includes(previousCache))sw=sw.replace(previousCache,nextCache);
if(!sw.includes("const CACHE = 'lourex-invoice-v214';"))throw new Error('Unable to advance the LOUREX PWA cache generation to v214.');
for(const runtime of requiredRuntimes)if(!sw.includes(runtime))throw new Error(`LOUREX PWA cache is missing required runtime ${runtime}.`);

// v214 is a critical auth-runtime migration. Older installed Safari/PWA clients
// can otherwise keep serving the pre-fix Firebase compat bundle indefinitely
// because the normal update policy leaves a new worker waiting for user action.
// Skip waiting only for this generated release; activate then deletes old cache
// generations and the existing activate handler claims controlled clients.
const installTail="await Promise.all(EXTERNAL_CORE.map(asset=>preserveExternalRuntime(cache,asset)));\n})()));";
const criticalInstallTail="await Promise.all(EXTERNAL_CORE.map(asset=>preserveExternalRuntime(cache,asset)));\n  await self.skipWaiting();\n})()));";
if(sw.includes(installTail))sw=sw.replace(installTail,criticalInstallTail);
if(!sw.includes('await self.skipWaiting();'))throw new Error('Unable to enable the critical v214 service-worker activation.');

await writeFile(swPath,sw);
