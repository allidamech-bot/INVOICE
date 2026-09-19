import { readFile, readdir, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
const cacheMarker="LOCAL_CORE.push('./canonical-redirect.js');";
let sw=await readFile(swPath,'utf8');

const compiledModules=(await readdir('dist/src',{recursive:true}))
  .map(file=>String(file).replaceAll('\\','/'))
  .filter(file=>file.endsWith('.js'))
  .sort()
  .map(file=>`./src/${file}`);

if(!compiledModules.length)throw new Error('No compiled LOUREX application modules found for PWA precache.');
if(!sw.includes(cacheMarker))throw new Error('Unable to locate the LOUREX PWA cache insertion point.');

for(const runtime of compiledModules){
  if(sw.includes(`'${runtime}'`)||sw.includes(`"${runtime}"`))continue;
  sw=sw.replace(cacheMarker,`LOCAL_CORE.push('${runtime}');\n${cacheMarker}`);
}

for(const runtime of compiledModules){
  if(!sw.includes(runtime))throw new Error(`LOUREX PWA cache is missing compiled runtime ${runtime}.`);
}

await writeFile(swPath,sw);
console.log(`[LOUREX PWA] precache verified for ${compiledModules.length} compiled application modules.`);
