import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');

if(!sw.includes('await self.skipWaiting();')){
  const installRuntimeTails=[
    'await Promise.allSettled(EXTERNAL_CORE.map(asset=>preserveExternalRuntime(cache,asset)));',
    'await Promise.all(EXTERNAL_CORE.map(asset=>preserveExternalRuntime(cache,asset)));'
  ];
  const installRuntimeTail=installRuntimeTails.find(tail=>sw.includes(tail));
  if(!installRuntimeTail)throw new Error('Unable to locate the service-worker install runtime tail.');
  sw=sw.replace(installRuntimeTail,`${installRuntimeTail}\n  await self.skipWaiting();`);
}

await writeFile(swPath,sw);
