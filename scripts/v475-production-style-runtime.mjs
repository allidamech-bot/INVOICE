import {readFile,writeFile,access} from 'node:fs/promises';

const INDEX_PATH='dist/index.html';
const OUTPUT_PATH='dist/styles/mobile-v475.bundle.css';
const SW_PATH='dist/sw.js';

const layers=[
  'mobile-command-center-v475.css',
  'mobile-command-center-v475-elite.css',
  'mobile-workspaces-v475.css',
  'mobile-editor-v475.css',
  'mobile-overlays-v475.css',
  'mobile-auth-v475.css',
  'mobile-review-v475.css'
];

const parts=[];
for(const name of layers){
  const sourcePath=`src/styles/${name}`;
  await access(sourcePath);
  let css=await readFile(sourcePath,'utf8');
  // The elite source imports the base layer for local/dev use. Production owns a
  // single deterministic bundle, so strip only the v475 base import before concat.
  css=css.replace(/^@import url\("\.\/mobile-command-center-v475\.css\?v=475-1"\);\s*/m,'');
  parts.push(`/* --- ${name} --- */\n${css.trim()}\n`);
}
await writeFile(OUTPUT_PATH,parts.join('\n'),'utf8');

let html=await readFile(INDEX_PATH,'utf8');
const bundleLink='<link rel="stylesheet" href="./styles/app.bundle.css" />';
const mobileLink='<link rel="stylesheet" href="./styles/mobile-v475.bundle.css?v=475-8" data-lourex-mobile-v475-production="true" />';
if(!html.includes(bundleLink))throw new Error('v475: production app.bundle.css link is missing.');
html=html.replace(/\n?\s*<link rel="stylesheet" href="\.\/styles\/mobile-v475\.bundle\.css(?:\?[^\"]*)?"[^>]*\/>/g,'');
html=html.replace(bundleLink,`${bundleLink}\n  ${mobileLink}`);
if(!html.includes(mobileLink))throw new Error('v475: production mobile design link was not installed.');
await writeFile(INDEX_PATH,html,'utf8');

let sw=await readFile(SW_PATH,'utf8');
const mobileAsset='"./styles/mobile-v475.bundle.css"';
if(!sw.includes(mobileAsset)){
  const localCore='const LOCAL_CORE = [';
  if(!sw.includes(localCore))throw new Error('v475: service-worker LOCAL_CORE list is missing.');
  sw=sw.replace(localCore,`${localCore}${mobileAsset},`);
  await writeFile(SW_PATH,sw,'utf8');
}

const finalCss=await readFile(OUTPUT_PATH,'utf8');
for(const marker of ['LOUREX Mobile Command Center v475','LOUREX Mobile Command Center v475.2','Deep presentation-only pass','Presentation-only premium mobile treatment','Presentation-only final mobile system']){
  if(!finalCss.includes(marker))throw new Error(`v475: production mobile bundle is missing marker: ${marker}`);
}
if(finalCss.includes('@import url("./mobile-command-center-v475.css?v=475-1")'))throw new Error('v475: nested base import leaked into the production mobile bundle.');

console.log('[LOUREX v475] production mobile design bundle installed after app.bundle.css.');
