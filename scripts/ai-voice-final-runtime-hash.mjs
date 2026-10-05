import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';

const composerPath='dist/ai-composer-v449.js';
const htmlPath='dist/index.html';
const swPath='dist/sw.js';

const composer=await readFile(composerPath);
const finalHash=createHash('sha256').update(composer).digest('hex').slice(0,16);
const finalUrl=`./ai-composer-v449.js?v=${finalHash}`;
const runtimePattern=/\.\/ai-composer-v449\.js\?v=[A-Za-z0-9._-]+/g;

let html=await readFile(htmlPath,'utf8');
const htmlMatches=html.match(runtimePattern)||[];
if(htmlMatches.length!==1)throw new Error(`Expected exactly one AI composer runtime URL in production HTML, found ${htmlMatches.length}.`);
html=html.replace(runtimePattern,finalUrl);
if(!html.includes(finalUrl))throw new Error('Final AI voice runtime hash was not installed in production HTML.');
await writeFile(htmlPath,html);

let sw=await readFile(swPath,'utf8');
const swMatches=sw.match(runtimePattern)||[];
if(!swMatches.length)throw new Error('Service worker does not precache the versioned AI composer runtime.');
sw=sw.replace(runtimePattern,finalUrl);
if(!sw.includes(finalUrl))throw new Error('Final AI voice runtime hash was not installed in the service worker cache manifest.');
await writeFile(swPath,sw);

console.log(`[LOUREX AI] final voice runtime cache identity ${finalHash} installed after all conversation/voice owners.`);
