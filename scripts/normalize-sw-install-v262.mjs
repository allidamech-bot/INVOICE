import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
const sw=await readFile(swPath,'utf8');
const start=sw.indexOf("self.addEventListener('install'");
const end=sw.indexOf("self.addEventListener('message'",start);
if(start<0||end<=start)throw new Error('Service-worker install and explicit message handlers are required.');
const install=sw.slice(start,end);
if(/(?:await\s+)?self\.skipWaiting\(\)/.test(install)){
  throw new Error('Service-worker install must not force activation while encrypted work is open.');
}
if(!sw.includes("event.data?.type==='SKIP_WAITING'")||!sw.includes('void self.skipWaiting()')){
  throw new Error('A user-requested SKIP_WAITING activation handler is required.');
}
await writeFile(swPath,sw);
