import { readFile, writeFile } from 'node:fs/promises';

const bundlePath='dist/styles/app.bundle.css';
const ownerPath='src/styles/premium-visual-system-v481.css';
const ownerName='premium-visual-system-v481.css';
const marker=`/* --- ${ownerName} --- */`;
const bridgeMarker='/* --- tailadmin-reliability-bridge-v320.css --- */';

let bundle=await readFile(bundlePath,'utf8');
let css=(await readFile(ownerPath,'utf8')).trim();

if(!css)throw new Error('v481 production bundle: premium visual owner is empty.');
if(!bundle.includes(bridgeMarker))throw new Error('v481 production bundle: reliability bridge marker is missing.');
if(bundle.includes(marker))throw new Error('v481 production bundle: duplicate premium visual owner detected.');

/* v481 is deliberately appended after every historical/runtime visual owner.
   The rebuild is presentation-only, but it must be the final cascade authority so
   v355/v363/v480 utility fallbacks cannot re-introduce charcoal/brown/violet seams. */
bundle=bundle.replace(/^@import url\("\.\/premium-visual-system-v481\.css[^\"]*"\);\s*$/gm,'');
bundle=`${bundle.trimEnd()}\n\n${marker}\n${css}\n`;

const bridgeIndex=bundle.indexOf(bridgeMarker);
const ownerIndex=bundle.indexOf(marker);
if(ownerIndex<=bridgeIndex)throw new Error('v481 production bundle: premium visual owner must load after the reliability bridge.');
if(/@import url\("\.\/premium-visual-system-v481\.css/.test(bundle))throw new Error('v481 production bundle: late runtime import survived production bundling.');
if(!bundle.includes('--lx481-canvas:#040b14'))throw new Error('v481 production bundle: dark premium token set is missing.');
if(!bundle.includes('html[data-ui-theme="light"]'))throw new Error('v481 production bundle: light premium token set is missing.');

await writeFile(bundlePath,bundle);
console.log('LOUREX v481 premium visual rebuild bundled as final production presentation owner.');
