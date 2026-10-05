import { readFile, writeFile } from 'node:fs/promises';

const sourcePath='src/styles/v485-visible-ui-corrections.css';
const bundlePath='dist/styles/app.bundle.css';
const standalonePath='dist/styles/v482-mobile-ux-repair.css';
const marker='/* --- v485-visible-ui-corrections.css --- */';
const modalInteractionGuard=`
/* A modal is the sole interactive surface while open. WebKit can otherwise
   let the fixed editor action dock sit above a portaled review footer and
   intercept Confirm / PDF taps. The mobile nav already follows this contract;
   extend it to both editor action docks without changing their normal layout. */
html body #root .app-ui:has(.modal-backdrop) :is(.mobile-editor-actionbar,.draft-mobile-actionbar){
  visibility:hidden!important;
  pointer-events:none!important;
}
`;

const sourceCss=(await readFile(sourcePath,'utf8')).trim();
if(!sourceCss)throw new Error('v485 visible UI: source stylesheet is empty.');
if(!sourceCss.includes('.ta-doc-type-tabs')||!sourceCss.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'))throw new Error('v485 visible UI: centered mobile document tile grid is missing.');
if(!sourceCss.includes('-webkit-mask-image:none!important')||!sourceCss.includes('overflow:visible!important'))throw new Error('v485 visible UI: clipped document-tab recovery is missing.');
if(!sourceCss.includes('@media screen and (min-width:901px)')||!sourceCss.includes('.ta-finance-dashboard'))throw new Error('v485 visible UI: iPad/desktop premium activation is missing.');
if(!sourceCss.includes('--lx485-canvas:#0a1826')||!sourceCss.includes('--lx485-surface-3:#1d3651'))throw new Error('v485 visible UI: dark hierarchy tokens are missing.');

const css=`${sourceCss}\n${modalInteractionGuard.trim()}\n`;
if(!css.includes('.app-ui:has(.modal-backdrop) :is(.mobile-editor-actionbar,.draft-mobile-actionbar)'))throw new Error('v485 visible UI: modal/editor action isolation guard is missing.');
if(!css.includes('visibility:hidden!important')||!css.includes('pointer-events:none!important'))throw new Error('v485 visible UI: modal/editor action isolation is incomplete.');

for(const path of [bundlePath,standalonePath]){
  let content=await readFile(path,'utf8');
  if(content.includes(marker))throw new Error(`v485 visible UI: duplicate owner marker in ${path}.`);
  content=`${content.trimEnd()}\n\n${marker}\n${css}`;
  await writeFile(path,content);
  const emitted=await readFile(path,'utf8');
  const v484Index=emitted.lastIndexOf('/* --- v484-responsive-visual-hierarchy.css --- */');
  const v485Index=emitted.lastIndexOf(marker);
  if(v485Index<0||v485Index<=v484Index)throw new Error(`v485 visible UI: final owner order is invalid in ${path}.`);
  if(!emitted.includes('.app-ui:has(.modal-backdrop) :is(.mobile-editor-actionbar,.draft-mobile-actionbar)'))throw new Error(`v485 visible UI: modal/editor action isolation was not emitted in ${path}.`);
}

console.log('LOUREX v485 visible UI owner appended after v484 with modal/editor action isolation in bundle + standalone production cascade.');
