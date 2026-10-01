import { readFile, writeFile } from 'node:fs/promises';

const bundlePath='dist/styles/app.bundle.css';
const bridgeMarker='/* --- tailadmin-reliability-bridge-v320.css --- */';
const owners=[
  ['executive-command-center-v480.css','480-1'],
  ['executive-workspaces-v480.css','480-2'],
  ['executive-editor-v480.css','480-3'],
  ['executive-overlays-auth-v480.css','480-4']
];

let bundle=await readFile(bundlePath,'utf8');
const bridgeIndex=bundle.indexOf(bridgeMarker);
if(bridgeIndex<0)throw new Error('v480 production bundle: final reliability bridge marker is missing.');

/* Source/dev may load the v480 root through the final bridge. Production never
   depends on late @import rules: every v480 owner is inserted directly before the
   reliability bridge in deterministic order. */
for(const [owner,version] of owners){
  const runtimeImport=new RegExp(`^@import url\\("\\./${owner.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\?v=${version}"\\);\\s*$`,'gm');
  bundle=bundle.replace(runtimeImport,'');
}

const parts=[];
for(const [owner] of owners){
  let css=(await readFile(`src/styles/${owner}`,'utf8')).trim();
  if(!css)throw new Error(`v480 production bundle: ${owner} is empty.`);

  /* The production bundle lives one directory above the source-owner URL depth.
     Normalize local brand artwork so QA and deployment both resolve /brand assets.
     Keep Noto Sans Arabic first while retaining TailAdmin's Outfit fallback contract. */
  css=css
    .replaceAll('url("../../brand/','url("../brand/')
    .replaceAll('font-family:"Noto Sans Arabic",Inter','font-family:"Noto Sans Arabic","Outfit",Inter');

  const marker=`/* --- ${owner} --- */`;
  if(bundle.includes(marker))throw new Error(`v480 production bundle: duplicate ${owner} detected.`);
  parts.push(`${marker}\n${css}`);
}

const insertion=bundle.indexOf(bridgeMarker);
bundle=`${bundle.slice(0,insertion)}${parts.join('\n\n')}\n\n${bundle.slice(insertion)}`;

let previous=-1;
for(const [owner] of owners){
  const marker=`/* --- ${owner} --- */`;
  const index=bundle.indexOf(marker);
  if(index<0||index<=previous)throw new Error(`v480 production bundle: ${owner} order is invalid.`);
  previous=index;
}
const finalBridgeIndex=bundle.indexOf(bridgeMarker);
if(previous>finalBridgeIndex)throw new Error('v480 production bundle: executive owners must remain before the reliability bridge.');
if(/@import url\("\.\/executive-[^\"]*v480\.css/.test(bundle))throw new Error('v480 production bundle: runtime executive @import survived production bundling.');
if(bundle.includes('url("../../brand/lourex-command-orbit.svg")'))throw new Error('v480 production bundle: command orbit retained the source-depth asset path.');
if(!bundle.includes('url("../brand/lourex-command-orbit.svg")'))throw new Error('v480 production bundle: command orbit asset path is missing after normalization.');
if(/font-family:"Noto Sans Arabic",Inter/.test(bundle))throw new Error('v480 production bundle: Arabic font stack lost the required Outfit fallback.');

await writeFile(bundlePath,bundle);
console.log(`LOUREX v480 executive design stack bundled (${owners.length} owners) before final reliability bridge.`);
