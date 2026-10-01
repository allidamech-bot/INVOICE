import { readFile, writeFile } from 'node:fs/promises';

const bundlePath='dist/styles/app.bundle.css';
const bridgeMarker='/* --- tailadmin-reliability-bridge-v320.css --- */';
const owners=[
  ['executive-command-center-v480.css','480-1'],
  ['executive-workspaces-v480.css','480-2'],
  ['executive-editor-v480.css','480-3'],
  ['executive-overlays-auth-v480.css','480-4'],
  ['executive-coherence-v480.css','480-5']
];

let bundle=await readFile(bundlePath,'utf8');
const bridgeIndex=bundle.indexOf(bridgeMarker);
if(bridgeIndex<0)throw new Error('v480 production bundle: final reliability bridge marker is missing.');

/* Source/dev loads the four structural v480 owners through the final bridge.
   Production additionally applies the screenshot-driven coherence closeout as the
   final v480 presentation owner. No production behavior depends on late @imports. */
for(const [owner,version] of owners){
  const runtimeImport=new RegExp(`^@import url\\("\\./${owner.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\?v=${version}"\\);\\s*$`,'gm');
  bundle=bundle.replace(runtimeImport,'');
}

const parts=[];
for(const [owner] of owners){
  let css=(await readFile(`src/styles/${owner}`,'utf8')).trim();
  if(!css)throw new Error(`v480 production bundle: ${owner} is empty.`);

  /* app.bundle.css is emitted inside /styles, one level shallower than source CSS
     assumptions used by the artwork URL. Normalize only the v480 payload here.
     Arabic remains Noto-first while Outfit stays in the fallback chain required by
     the established TailAdmin typography contract. */
  css=css
    .replaceAll('url("../../brand/','url("../brand/')
    .replaceAll('font-family:"Noto Sans Arabic",Inter','font-family:"Noto Sans Arabic","Outfit",Inter');

  if(css.includes('url("../../brand/lourex-command-orbit.svg")'))throw new Error(`v480 production bundle: ${owner} retained the source-depth orbit path.`);
  if(css.includes('font-family:"Noto Sans Arabic",Inter'))throw new Error(`v480 production bundle: ${owner} lost the Outfit fallback normalization.`);

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
if(!bundle.includes('url("../brand/lourex-command-orbit.svg")'))throw new Error('v480 production bundle: command orbit asset path is missing after normalization.');
if(!bundle.includes('/* --- executive-coherence-v480.css --- */'))throw new Error('v480 production bundle: screenshot-driven coherence owner is missing.');

await writeFile(bundlePath,bundle);
console.log(`LOUREX v480 executive design stack bundled (${owners.length} owners) before final reliability bridge.`);
