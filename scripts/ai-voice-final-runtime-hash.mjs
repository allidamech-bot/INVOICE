import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';

const composerPath='dist/ai-composer-v449.js';
const htmlPath='dist/index.html';
const swPath='dist/sw.js';
const composerCssPath='dist/ai-composer-v449.css';

const composer=await readFile(composerPath);
const finalHash=createHash('sha256').update(composer).digest('hex').slice(0,16);
const finalUrl=`./ai-composer-v449.js?v=${finalHash}`;
const finalStyleHash=createHash('sha256').update(await readFile(composerCssPath)).digest('hex').slice(0,16);
const finalStyleUrl=`./ai-composer-v449.css?v=${finalStyleHash}`;
const stylePattern=/\.\/ai-composer-v449\.css\?v=[A-Za-z0-9._-]+/g;
const cachedStylePattern=/\.\/ai-composer-v449\.css(?:\?v=[A-Za-z0-9._-]+)?/g;
const appStyleHash=createHash('sha256').update(await readFile('dist/styles/app.bundle.css')).digest('hex').slice(0,16);
const appStyleUrl=`./styles/app.bundle.css?v=${appStyleHash}`;
const appStylePattern=/\.\/styles\/app\.bundle\.css(?:\?v=[A-Za-z0-9._-]+)?/g;
const runtimePattern=/\.\/ai-composer-v449\.js\?v=[A-Za-z0-9._-]+/g;

let html=await readFile(htmlPath,'utf8');
const htmlMatches=html.match(runtimePattern)||[];
if(htmlMatches.length!==1)throw new Error(`Expected exactly one AI composer runtime URL in production HTML, found ${htmlMatches.length}.`);
if((html.match(stylePattern)||[]).length!==1)throw new Error('Expected exactly one AI composer stylesheet URL in production HTML.');
if((html.match(appStylePattern)||[]).length!==1)throw new Error('Expected exactly one application stylesheet URL in production HTML.');
html=html.replace(runtimePattern,finalUrl).replace(stylePattern,finalStyleUrl).replace(appStylePattern,appStyleUrl);
if(!html.includes(finalUrl))throw new Error('Final AI voice runtime hash was not installed in production HTML.');
await writeFile(htmlPath,html);

let sw=await readFile(swPath,'utf8');
const swMatches=sw.match(runtimePattern)||[];
if(!swMatches.length)throw new Error('Service worker does not precache the versioned AI composer runtime.');
sw=sw.replace(runtimePattern,finalUrl).replace(cachedStylePattern,finalStyleUrl).replace(appStylePattern,appStyleUrl);
if(!sw.includes(finalUrl))throw new Error('Final AI voice runtime hash was not installed in the service worker cache manifest.');
// The last build owner knows the actual URLs emitted by every earlier owner.
// Cache keys include query strings: an unversioned vendor/runtime entry does
// not satisfy a versioned request on the first offline visit after installation.
// Runtime configuration deliberately stays network-only; never cache it here.
const localAssets=[...new Set([...html.matchAll(/(?:src|href)=["'](\.\/[^"']+)["']/g)].map(match=>match[1]))]
  .filter(asset=>asset.split('?')[0]!=='./runtime-config.js');
const cacheMarker="LOCAL_CORE.push('./canonical-redirect.js');";
if(!sw.includes(cacheMarker))throw new Error('Final runtime precache insertion marker is missing.');
for(const asset of localAssets){
  if(sw.includes(JSON.stringify(asset))||sw.includes(`'${asset}'`))continue;
  sw=sw.replace(cacheMarker,`LOCAL_CORE.push(${JSON.stringify(asset)});\n${cacheMarker}`);
}
if(!sw.includes(appStyleUrl))throw new Error('Final application stylesheet URL is missing from the offline cache manifest.');
if(!sw.includes(finalStyleUrl))throw new Error('Final stylesheet URL is missing from the offline cache manifest.');
await writeFile(swPath,sw);

console.log(`[LOUREX AI] final voice runtime cache identity ${finalHash} and stylesheet identity ${finalStyleHash} installed after all conversation/voice owners.`);
