import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');
const runtime='./src/lib/ai-finance.js';
const cacheMarker="LOCAL_CORE.push('./canonical-redirect.js');";

if(!sw.includes(`'${runtime}'`)&&!sw.includes(`"${runtime}"`)){
  if(!sw.includes(cacheMarker))throw new Error('Unable to locate the LOUREX PWA cache insertion point for AI finance.');
  sw=sw.replace(cacheMarker,`LOCAL_CORE.push('${runtime}');\n${cacheMarker}`);
}
if(!sw.includes(runtime))throw new Error(`LOUREX PWA cache is missing required runtime ${runtime}.`);

await writeFile(swPath,sw);
