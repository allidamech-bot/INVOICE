import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');

const compact="self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(LOCAL_CORE);await Promise.all(EXTERNAL_CORE.map(asset=>preserveExternalRuntime(cache,asset)));})()));";
const normalized="self.addEventListener('install',event=>event.waitUntil((async()=>{\n  const cache=await caches.open(CACHE);\n  await cache.addAll(LOCAL_CORE);\n  await Promise.all(EXTERNAL_CORE.map(asset=>preserveExternalRuntime(cache,asset)));\n})()));";

if(sw.includes(compact))sw=sw.replace(compact,normalized);
await writeFile(swPath,sw);
