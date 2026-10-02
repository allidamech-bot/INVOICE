import { readFile, writeFile } from 'node:fs/promises';

const bundlePath='dist/styles/app.bundle.css';
const bridgeMarker='/* --- tailadmin-reliability-bridge-v320.css --- */';
const owners=[
  'premium-visual-system-v481.css',
  'premium-workspaces-v481.css',
  'premium-overlays-v481.css',
  'premium-business-v481.css',
  'premium-regression-fixes-v481.css'
];

let bundle=await readFile(bundlePath,'utf8');
if(!bundle.includes(bridgeMarker))throw new Error('v481 production bundle: reliability bridge marker is missing.');

const parts=[];
for(const ownerName of owners){
  const ownerPath=`src/styles/${ownerName}`;
  const marker=`/* --- ${ownerName} --- */`;
  const css=(await readFile(ownerPath,'utf8')).trim();
  if(!css)throw new Error(`v481 production bundle: ${ownerName} is empty.`);
  if(bundle.includes(marker))throw new Error(`v481 production bundle: duplicate ${ownerName} detected.`);
  const runtimeImport=new RegExp(`^@import url\\(\\"\\./${ownerName.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}[^\\"]*\\"\\);\\s*$`,'gm');
  bundle=bundle.replace(runtimeImport,'');
  parts.push(`${marker}\n${css}`);
}

/* v481 is deliberately appended after every historical/runtime visual owner.
   The rebuild is presentation-only, but it must be the final cascade authority so
   v355/v363/v480 utility fallbacks cannot re-introduce charcoal/brown/violet seams. */
bundle=`${bundle.trimEnd()}\n\n${parts.join('\n\n')}\n`;

const bridgeIndex=bundle.indexOf(bridgeMarker);
let previous=bridgeIndex;
for(const ownerName of owners){
  const marker=`/* --- ${ownerName} --- */`;
  const ownerIndex=bundle.indexOf(marker);
  if(ownerIndex<=previous)throw new Error(`v481 production bundle: ${ownerName} order is invalid.`);
  previous=ownerIndex;
}
if(/@import url\("\.\/premium-(?:visual-system|workspaces|overlays|business|regression-fixes)-v481\.css/.test(bundle))throw new Error('v481 production bundle: late runtime import survived production bundling.');
if(!bundle.includes('--lx481-canvas:#040b14'))throw new Error('v481 production bundle: dark premium token set is missing.');
if(!bundle.includes('html[data-ui-theme="light"]'))throw new Error('v481 production bundle: light premium token set is missing.');
if(!bundle.includes('.lx-pipeline-board'))throw new Error('v481 production bundle: sales pipeline rebuild is missing.');
if(!bundle.includes('.ta-create-menu-mobile'))throw new Error('v481 production bundle: mobile command-surface rebuild is missing.');
if(!bundle.includes('.ta-settings-shell'))throw new Error('v481 production bundle: settings/account rebuild is missing.');
if(!bundle.includes('background-color:var(--ft-accent,#315da8)!important'))throw new Error('v481 production bundle: primary-action computed-color hardening is missing.');
if(!bundle.includes('html body #root .app-ui .ta-ops-metrics>*'))throw new Error('v481 production bundle: operations KPI surface hardening is missing.');

await writeFile(bundlePath,bundle);
console.log(`LOUREX v481 premium visual rebuild bundled (${owners.length} final presentation owners).`);
