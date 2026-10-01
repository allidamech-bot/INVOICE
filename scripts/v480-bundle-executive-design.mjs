import { readFile, writeFile } from 'node:fs/promises';

const bundlePath='dist/styles/app.bundle.css';
const bridgeMarker='/* --- tailadmin-reliability-bridge-v320.css --- */';
const owner='executive-command-center-v480.css';

let bundle=await readFile(bundlePath,'utf8');
const bridgeIndex=bundle.indexOf(bridgeMarker);
if(bridgeIndex<0)throw new Error('v480 production bundle: final reliability bridge marker is missing.');

const runtimeImport=/^@import url\("\.\/executive-command-center-v480\.css\?v=480-1"\);\s*$/gm;
bundle=bundle.replace(runtimeImport,'');

const css=(await readFile(`src/styles/${owner}`,'utf8')).trim();
if(!css)throw new Error('v480 production bundle: executive design owner is empty.');
const marker=`/* --- ${owner} --- */`;
if(bundle.includes(marker))throw new Error('v480 production bundle: duplicate executive design owner detected.');

const insertion=bundle.indexOf(bridgeMarker);
bundle=`${bundle.slice(0,insertion)}${marker}\n${css}\n\n${bundle.slice(insertion)}`;

const ownerIndex=bundle.indexOf(marker);
const finalBridgeIndex=bundle.indexOf(bridgeMarker);
if(ownerIndex<0||ownerIndex>finalBridgeIndex)throw new Error('v480 production bundle: executive design owner must remain immediately before the reliability bridge.');
if(/@import url\("\.\/executive-command-center-v480\.css/.test(bundle))throw new Error('v480 production bundle: runtime v480 @import survived production bundling.');

await writeFile(bundlePath,bundle);
console.log('LOUREX v480 executive design bundled before final reliability bridge.');
