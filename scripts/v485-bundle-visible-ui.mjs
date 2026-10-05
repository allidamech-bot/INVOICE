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
const editorFlatteningGuard=`
/* LOUREX Batch 5 — document editor visual flattening.
   The document editor gets one intentional surface per semantic section.
   Pricing, advanced item metadata, document design and watermark controls are
   content inside that surface, not nested cards. This is screen-only: printable
   document paper, PDF output, templates and fixed editor action docks are not
   styled here. */
html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card){
  min-width:0!important;
  background:var(--lx485-surface-2)!important;
  color:var(--lx485-text-2)!important;
  border:1px solid var(--lx485-line)!important;
  border-radius:16px!important;
  box-shadow:none!important;
  overflow:hidden!important;
}
html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card)>header,
html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card)>.form-grid,
html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card)>footer,
html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card) .item-core-grid,
html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card) .item-pricing-grid,
html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card) .item-advanced-control,
html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card) .item-advanced-fields{
  min-width:0!important;
  background:transparent!important;
  background-image:none!important;
  box-shadow:none!important;
}
html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card) .item-pricing-grid,
html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card) .item-advanced-fields{
  border:0!important;
  border-radius:0!important;
  padding-inline:0!important;
}
html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card) .item-pricing-grid{
  padding-block:10px!important;
}
html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card) .item-advanced-fields{
  margin-top:2px!important;
  padding-block:12px 2px!important;
  border-top:1px solid color-mix(in srgb,var(--lx485-line) 76%,transparent)!important;
}
html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card)>header{
  border-bottom:1px solid color-mix(in srgb,var(--lx485-line) 82%,transparent)!important;
}
html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card)>footer{
  border-top:1px solid color-mix(in srgb,var(--lx485-line) 72%,transparent)!important;
}
html body #root .app-ui .screen-editor .item-advanced-control{
  padding:2px 0!important;
  border:0!important;
  border-radius:0!important;
}
html body #root .app-ui .screen-editor .item-advanced-control>button,
html body #root .app-ui .screen-editor .item-card-actions button{
  min-height:44px!important;
  box-shadow:none!important;
}
html body #root .app-ui .screen-editor .item-advanced-control>button{
  background:transparent!important;
  color:var(--lx485-text-2)!important;
  border:1px solid var(--lx485-line)!important;
  border-radius:11px!important;
}
html body #root .app-ui .screen-editor .item-line-total{
  background:transparent!important;
  border:0!important;
  border-radius:0!important;
  padding-inline:0!important;
  color:var(--lx485-text)!important;
}
html body #root .app-ui .screen-editor :is(.design-advanced-panel,.document-design-stack,.document-design-group,.document-design-rows,.appearance-system-grid){
  min-width:0!important;
  background:transparent!important;
  background-image:none!important;
  border:0!important;
  border-radius:0!important;
  box-shadow:none!important;
}
html body #root .app-ui .screen-editor :is(.watermark-editor-card,.watermark-editor-head,.watermark-editor-body){
  min-width:0!important;
  background:transparent!important;
  background-image:none!important;
  border-radius:0!important;
  box-shadow:none!important;
}
html body #root .app-ui .screen-editor .watermark-editor-card{
  border:0!important;
}
html body #root .app-ui .screen-editor .watermark-editor-head{
  border-inline:0!important;
  border-top:1px solid var(--lx485-line)!important;
  border-bottom:1px solid color-mix(in srgb,var(--lx485-line) 72%,transparent)!important;
}
html body #root .app-ui .screen-editor .watermark-editor-body{
  border:0!important;
}
html body #root .app-ui .screen-editor :is(.document-design-control>.input.select,.document-color-control,.watermark-editor-body input,.watermark-editor-body select,.watermark-editor-body button){
  min-height:44px!important;
}
html body #root .app-ui .screen-editor :is(.document-design-label,.watermark-editor-card,.item-advanced-fields){
  text-align:start!important;
}
@media screen and (max-width:900px){
  html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card) .item-pricing-grid,
  html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card) .item-advanced-fields{
    grid-template-columns:minmax(0,1fr)!important;
    gap:9px!important;
  }
  html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card){border-radius:14px!important;}
  html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card) .item-pricing-grid{padding-block:9px!important;}
}
@media screen and (max-width:430px){
  html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card)>header,
  html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card)>.form-grid,
  html body #root .app-ui .screen-editor :is(.item-card,.premium-item-card)>footer{
    padding-inline:10px!important;
  }
  html body #root .app-ui .screen-editor .item-card-actions{gap:4px!important;}
}
`;

const sourceCss=(await readFile(sourcePath,'utf8')).trim();
if(!sourceCss)throw new Error('v485 visible UI: source stylesheet is empty.');
if(!sourceCss.includes('.ta-doc-type-tabs')||!sourceCss.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'))throw new Error('v485 visible UI: centered mobile document tile grid is missing.');
if(!sourceCss.includes('-webkit-mask-image:none!important')||!sourceCss.includes('overflow:visible!important'))throw new Error('v485 visible UI: clipped document-tab recovery is missing.');
if(!sourceCss.includes('@media screen and (min-width:901px)')||!sourceCss.includes('.ta-finance-dashboard'))throw new Error('v485 visible UI: iPad/desktop premium activation is missing.');
if(!sourceCss.includes('--lx485-canvas:#0a1826')||!sourceCss.includes('--lx485-surface-3:#1d3651'))throw new Error('v485 visible UI: dark hierarchy tokens are missing.');

const css=`${sourceCss}\n${modalInteractionGuard.trim()}\n${editorFlatteningGuard.trim()}\n`;
if(!css.includes('.app-ui:has(.modal-backdrop) :is(.mobile-editor-actionbar,.draft-mobile-actionbar)'))throw new Error('v485 visible UI: modal/editor action isolation guard is missing.');
if(!css.includes('visibility:hidden!important')||!css.includes('pointer-events:none!important'))throw new Error('v485 visible UI: modal/editor action isolation is incomplete.');
if(!css.includes('LOUREX Batch 5 — document editor visual flattening')||!css.includes('.item-pricing-grid')||!css.includes('.watermark-editor-card'))throw new Error('v485 visible UI: Batch 5 editor flattening guard is missing.');
if(!css.includes('background:transparent!important')||!css.includes('grid-template-columns:minmax(0,1fr)!important')||!css.includes('min-height:44px!important'))throw new Error('v485 visible UI: Batch 5 editor flattening contract is incomplete.');

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
  if(!emitted.includes('LOUREX Batch 5 — document editor visual flattening'))throw new Error(`v485 visible UI: Batch 5 editor flattening was not emitted in ${path}.`);
}

console.log('LOUREX v485 visible UI owner appended after v484 with modal/editor isolation and Batch 5 editor visual flattening.');
