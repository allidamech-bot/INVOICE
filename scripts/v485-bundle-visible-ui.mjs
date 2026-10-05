import { readFile, writeFile } from 'node:fs/promises';

const sourcePath='src/styles/v485-visible-ui-corrections.css';
const bundlePath='dist/styles/app.bundle.css';
const standalonePath='dist/styles/v482-mobile-ux-repair.css';
const marker='/* --- v485-visible-ui-corrections.css --- */';

const css=(await readFile(sourcePath,'utf8')).trim();
if(!css)throw new Error('v485 visible UI: source stylesheet is empty.');
if(!css.includes('.ta-doc-type-tabs')||!css.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'))throw new Error('v485 visible UI: centered mobile document tile grid is missing.');
if(!css.includes('-webkit-mask-image:none!important')||!css.includes('overflow:visible!important'))throw new Error('v485 visible UI: clipped document-tab recovery is missing.');
if(!css.includes('@media screen and (min-width:901px)')||!css.includes('.ta-finance-dashboard'))throw new Error('v485 visible UI: iPad/desktop premium activation is missing.');
if(!css.includes('--lx485-canvas:#0a1826')||!css.includes('--lx485-surface-3:#1d3651'))throw new Error('v485 visible UI: dark hierarchy tokens are missing.');

for(const path of [bundlePath,standalonePath]){
  let content=await readFile(path,'utf8');
  if(content.includes(marker))throw new Error(`v485 visible UI: duplicate owner marker in ${path}.`);
  content=`${content.trimEnd()}\n\n${marker}\n${css}\n`;
  await writeFile(path,content);
  const emitted=await readFile(path,'utf8');
  const v484Index=emitted.lastIndexOf('/* --- v484-responsive-visual-hierarchy.css --- */');
  const v485Index=emitted.lastIndexOf(marker);
  if(v485Index<0||v485Index<=v484Index)throw new Error(`v485 visible UI: final owner order is invalid in ${path}.`);
}

console.log('LOUREX v485 visible UI owner appended after v484 in bundle + standalone production cascade.');
