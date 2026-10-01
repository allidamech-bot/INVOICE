import { readFile, writeFile } from 'node:fs/promises';

const bundlePath='dist/styles/app.bundle.css';
const bridgeMarker='/* --- tailadmin-reliability-bridge-v320.css --- */';
const owners=[
  'mobile-command-center-v475.css',
  'mobile-command-center-v475-elite.css',
  'mobile-workspaces-v475.css',
  'mobile-editor-v475.css',
  'mobile-overlays-v475.css',
  'mobile-auth-v475.css',
  'mobile-review-v475.css',
  'mobile-v475-qa-closeout.css'
];

let bundle=await readFile(bundlePath,'utf8');
const bridgeIndex=bundle.indexOf(bridgeMarker);
if(bridgeIndex<0)throw new Error('v475 production bundle: final reliability bridge marker is missing.');

/*
 * Source/dev intentionally loads the v475 stack through @import at the top of the
 * reliability bridge. Production is different: build.mjs concatenates every local
 * stylesheet into app.bundle.css, so those @import statements land late in the
 * combined stylesheet after normal CSS rules. Browsers ignore late @import rules.
 * Inline the complete v475 stack before the reliability bridge instead.
 */
const runtimeImportPattern=/^@import url\("\.\/(mobile-command-center-v475-elite|mobile-workspaces-v475|mobile-editor-v475|mobile-overlays-v475|mobile-auth-v475|mobile-review-v475)\.css\?v=475-[2-7]"\);\s*$/gm;
bundle=bundle.replace(runtimeImportPattern,'');

const blocks=[];
for(const name of owners){
  let css=(await readFile(`src/styles/${name}`,'utf8')).trim();
  if(!css)throw new Error(`v475 production bundle: ${name} is empty.`);
  if(name==='mobile-command-center-v475-elite.css'){
    css=css.replace(/^@import url\("\.\/mobile-command-center-v475\.css\?v=475-1"\);\s*/m,'').trim();
  }
  blocks.push(`/* --- ${name} --- */\n${css}\n`);
}

const insertion=bundle.indexOf(bridgeMarker);
if(insertion<0)throw new Error('v475 production bundle: reliability bridge marker moved before insertion.');
bundle=`${bundle.slice(0,insertion)}${blocks.join('\n')}\n${bundle.slice(insertion)}`;

for(const name of owners){
  const marker=`/* --- ${name} --- */`;
  const ownerIndex=bundle.indexOf(marker);
  const finalBridgeIndex=bundle.indexOf(bridgeMarker);
  if(ownerIndex<0||ownerIndex>finalBridgeIndex)throw new Error(`v475 production bundle: ${name} was not inlined before the reliability bridge.`);
  if(bundle.indexOf(marker)!==bundle.lastIndexOf(marker))throw new Error(`v475 production bundle: duplicate owner ${name}.`);
}

if(/@import url\("\.\/mobile-(?:command-center|workspaces|editor|overlays|auth|review)-v475/.test(bundle)){
  throw new Error('v475 production bundle: a runtime v475 @import survived bundling.');
}

await writeFile(bundlePath,bundle);
console.log('LOUREX v475 production mobile design bundled: base + elite + workspaces + editor + overlays + auth + review + QA closeout are inline before the final reliability bridge.');
