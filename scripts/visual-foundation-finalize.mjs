import { readFile, writeFile } from 'node:fs/promises';

const bundlePath='dist/styles/app.bundle.css';
const htmlPath='dist/index.html';
const swPath='dist/sw.js';
const foundationSource='src/styles/lourex-visual-foundation.css';
const foundationOutput='dist/styles/lourex-visual-foundation.css';
const compatibilityOutput='dist/styles/v482-mobile-ux-repair.css';

const retiredBlocks=[
  'v346-template-color-visual-closeout.css',
  'hostinger-inspired-v353.css',
  'hostinger-premium-closeout-v354.css',
  'hostinger-system-contract-v355.css',
  'hostinger-final-coherence-v356.css',
  'hostinger-interaction-polish-v357.css',
  'hostinger-blue-luxury-v358.css',
  'hostinger-blue-precision-v359.css',
  'matte-black-dark-v360.css',
  'mobile-site-density-v361.css',
  'premium-ux-coherence-v362.css',
  'executive-command-center-v480.css',
  'executive-workspaces-v480.css',
  'executive-editor-v480.css',
  'executive-overlays-auth-v480.css',
  'executive-coherence-v480.css',
  'premium-visual-system-v481.css',
  'premium-workspaces-v481.css',
  'premium-overlays-v481.css',
  'premium-business-v481.css',
  'premium-regression-fixes-v481.css',
  'v482-mobile-ux-repair.css',
  'v482-narrow-readability.css',
  'v483-mobile-density.css',
  'v484-responsive-visual-hierarchy.css',
  'v485-visible-ui-corrections.css'
];

function stripMarkedBlock(source,name){
  const marker=`/* --- ${name} --- */`;
  let output=source;
  for(;;){
    const start=output.indexOf(marker);
    if(start<0)break;
    const next=output.indexOf('/* --- ',start+marker.length);
    output=`${output.slice(0,start)}${next>=0?output.slice(next):''}`;
  }
  return output;
}

let bundle=await readFile(bundlePath,'utf8');
for(const name of retiredBlocks)bundle=stripMarkedBlock(bundle,name);

/* Production has no late historical visual imports. Functional runtime CSS stays
   in the reliability bridge; presentation is emitted once from the stable owner. */
bundle=bundle.replace(/^@import url\("\.\/executive-(?:command-center|workspaces|editor|overlays-auth)-v480\.css\?v=480-[1-4]"\);\s*$/gm,'');
bundle=bundle.replace(/^@import url\("\.\/lourex-visual-foundation\.css"\);\s*$/gm,'');
bundle=bundle.replace(/\n{3,}/g,'\n\n').trimEnd()+"\n";

for(const name of retiredBlocks){
  if(bundle.includes(`/* --- ${name} --- */`))throw new Error(`visual foundation: retired owner still exists in production bundle: ${name}`);
}
if(/@import url\("\.\/executive-[^\"]*v480\.css/.test(bundle))throw new Error('visual foundation: retired v480 runtime import survived production bundling.');
await writeFile(bundlePath,bundle);

const foundation=(await readFile(foundationSource,'utf8')).trim()+"\n";
if(!foundation.includes('--app-canvas:')||!foundation.includes('--app-surface:')||!foundation.includes('--app-card:')||!foundation.includes('--app-input:'))throw new Error('visual foundation: semantic surface hierarchy is incomplete.');
if(!foundation.includes('.ta-documents-header-actions')||!foundation.includes('.ta-doc-register-card')||!foundation.includes('.ta-mobile-sheet')||!foundation.includes('.ta-mobile-nav'))throw new Error('visual foundation: required shared workspace ownership is incomplete.');
await writeFile(foundationOutput,foundation);

/* Compatibility artifact for historical visual QA fixtures only. Production HTML
   is rewired below to the canonical filename; both files are generated from the
   one canonical source so there is no second source owner. */
await writeFile(compatibilityOutput,`/* QA compatibility alias. Canonical source: lourex-visual-foundation.css */\n${foundation}`);

let html=await readFile(htmlPath,'utf8');
const oldHref='./styles/v482-mobile-ux-repair.css?v=482';
const canonicalHref='./styles/lourex-visual-foundation.css?v=foundation-1';
html=html.replaceAll(oldHref,canonicalHref).replaceAll('data-lourex-v482-mobile-ux="true"','data-lourex-visual-foundation="true"');
if(!html.includes(canonicalHref))throw new Error('visual foundation: canonical production stylesheet is not linked.');
if(html.includes(oldHref))throw new Error('visual foundation: historical v482 production link remains.');
if((html.match(/data-lourex-visual-foundation="true"/g)||[]).length!==1)throw new Error('visual foundation: expected exactly one canonical stylesheet link.');

/* Make the canonical owner literally the final stylesheet in production. Scoped
   feature CSS may exist in source for component structure, but nothing may load
   after the product-wide presentation owner in the deployed document. */
const canonicalTagPattern=new RegExp(`\\s*<link rel="stylesheet" href="${canonicalHref.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}" data-lourex-visual-foundation="true" \\/>`);
const canonicalMatch=html.match(canonicalTagPattern);
if(!canonicalMatch)throw new Error('visual foundation: canonical stylesheet tag could not be isolated.');
html=html.replace(canonicalTagPattern,'');
if(!html.includes('</head>'))throw new Error('visual foundation: production head closing tag is missing.');
html=html.replace('</head>',`  <link rel="stylesheet" href="${canonicalHref}" data-lourex-visual-foundation="true" />\n</head>`);
const stylesheetLinks=[...html.matchAll(/<link rel="stylesheet"[^>]*>/g)].map(match=>match[0]);
if(!stylesheetLinks.length||!stylesheetLinks.at(-1)?.includes('data-lourex-visual-foundation="true"'))throw new Error('visual foundation: canonical owner is not the final production stylesheet.');
await writeFile(htmlPath,html);

let sw=await readFile(swPath,'utf8');
sw=sw.replaceAll(oldHref,canonicalHref);
if(!sw.includes(canonicalHref)){
  const marker="LOCAL_CORE.push('./canonical-redirect.js');";
  if(!sw.includes(marker))throw new Error('visual foundation: service-worker insertion marker is missing.');
  sw=sw.replace(marker,`LOCAL_CORE.push('${canonicalHref}');\n${marker}`);
}
if(sw.includes(oldHref))throw new Error('visual foundation: historical v482 stylesheet remains in service-worker cache.');
await writeFile(swPath,sw);

console.log(`LOUREX canonical visual foundation finalized; retired ${retiredBlocks.length} historical visual owners from the production cascade.`);
