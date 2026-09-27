import { readFile, writeFile } from 'node:fs/promises';

const bundlePath='dist/styles/app.bundle.css';
const bridgeMarker='/* --- tailadmin-reliability-bridge-v320.css --- */';
const owners=[
  ['mobile-ux-functional-hardening-v363.css','@import url("./mobile-ux-functional-hardening-v363.css?v=363-1");'],
  ['modal-viewport-reconciliation-v363.css','@import url("./modal-viewport-reconciliation-v363.css?v=363-1");'],
  ['mobile-ux-deep-audit-v363.css','@import url("./mobile-ux-deep-audit-v363.css?v=363-1");']
];

let bundle=await readFile(bundlePath,'utf8');
const bridgeIndex=bundle.indexOf(bridgeMarker);
if(bridgeIndex<0)throw new Error('v363 bundle hardening: final TailAdmin reliability bridge marker is missing.');

for(const [name,importLine] of owners){
  if(!bundle.includes(importLine))throw new Error(`v363 bundle hardening: expected source import is missing for ${name}.`);
  bundle=bundle.replace(`${importLine}\n`,'').replace(importLine,'');
}

const ownerBlocks=[];
for(const [name] of owners){
  const css=(await readFile(`src/styles/${name}`,'utf8')).trim();
  if(!css)throw new Error(`v363 bundle hardening: ${name} is empty.`);
  ownerBlocks.push(`/* --- ${name} --- */\n${css}\n`);
}

const insertion=bundle.indexOf(bridgeMarker);
if(insertion<0)throw new Error('v363 bundle hardening: reliability bridge marker moved while preparing bundle.');
bundle=`${bundle.slice(0,insertion)}${ownerBlocks.join('\n')}\n${bundle.slice(insertion)}`;

for(const [name,importLine] of owners){
  if(bundle.includes(importLine))throw new Error(`v363 bundle hardening: late @import remains for ${name}.`);
  const ownerMarker=`/* --- ${name} --- */`;
  const ownerIndex=bundle.indexOf(ownerMarker);
  const finalBridgeIndex=bundle.indexOf(bridgeMarker);
  if(ownerIndex<0||ownerIndex>finalBridgeIndex)throw new Error(`v363 bundle hardening: ${name} is not inlined before the final reliability bridge.`);
}

await writeFile(bundlePath,bundle);
