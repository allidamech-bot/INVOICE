import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');

const installRuntimeTail='await Promise.all(EXTERNAL_CORE.map(asset=>preserveExternalRuntime(cache,asset)));';
if(!sw.includes('await self.skipWaiting();')){
  if(!sw.includes(installRuntimeTail))throw new Error('Unable to locate the service-worker install runtime tail.');
  sw=sw.replace(installRuntimeTail,`${installRuntimeTail}\n  await self.skipWaiting();`);
}

await writeFile(swPath,sw);
