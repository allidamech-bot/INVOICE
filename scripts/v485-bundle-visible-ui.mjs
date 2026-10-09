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
const editorTemplateControlsGuard=`
  /* Template controls are controls, not black badges/cards from older owners. */
  html body #root .app-ui :is(.screen-editor,.editor-screen) .template-card{
    background:var(--ft-surface)!important;
    background-image:none!important;
    border-color:var(--ft-line-strong)!important;
    color:var(--ft-text-strong)!important;
    box-shadow:none!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .template-card.selected{
    border-color:var(--lrx-editor-accent)!important;
    box-shadow:0 0 0 2px color-mix(in srgb,var(--lrx-editor-accent) 14%,transparent)!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .template-favorite-button{
    background:var(--ft-surface)!important;
    background-image:none!important;
    border:1px solid var(--ft-line)!important;
    color:var(--ft-muted)!important;
    box-shadow:none!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .template-favorite-button.active{
    background:var(--ft-accent-faint)!important;
    border-color:color-mix(in srgb,var(--lrx-editor-accent) 42%,var(--ft-line))!important;
    color:var(--lrx-editor-accent)!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .template-default-badge{
    background:var(--ft-accent-faint)!important;
    background-image:none!important;
    border-color:color-mix(in srgb,var(--lrx-editor-accent) 38%,var(--ft-line))!important;
    color:var(--lrx-editor-accent)!important;
    box-shadow:none!important;
  }

  html body #root .app-ui :is(.screen-editor,.editor-screen) .template-preference-bar{
    background:transparent!important;
    background-image:none!important;
    border-inline:0!important;
    border-radius:0!important;
    border-top:1px solid var(--ft-line)!important;
    border-bottom:1px solid var(--ft-line)!important;
    box-shadow:none!important;
  }
`;
const documentOutputContrastGuard=`


/* Executive table headings are client-facing text, not decorative accent text.
   Keep their foreground independent of the gold accent in Auto/Custom output. */
.invoice-page.template-executive .items-table thead th{
  background:#102d41!important;
  background-image:none!important;
  color:#fff!important;
  -webkit-text-fill-color:#fff!important;
}
.invoice-page.template-executive .items-table thead th small{
  color:#e7edf1!important;
  -webkit-text-fill-color:#e7edf1!important;
}


.invoice-page.template-trade .items-table thead th{
  background:#16384d!important;
  background-image:none!important;
  color:#fff!important;
  -webkit-text-fill-color:#fff!important;
}
.invoice-page.template-trade .items-table thead th small{
  color:#e8eef2!important;
  -webkit-text-fill-color:#e8eef2!important;
}


/* Dark-template readability closeout observed in live QA. */
.invoice-page.template-blackivory{
  --rule:#837665;
}
.invoice-page.template-blackivory .items-table{
  border-color:#837665!important;
}
.invoice-page.template-blackivory .items-table tbody td{
  border-bottom-color:#6f6557!important;
}
.invoice-page.template-noir{
  --rule:#765f3f;
}
.invoice-page.template-noir .party-grid,
.invoice-page.template-noir .party-block{
  border-color:#765f3f!important;
}
.invoice-page.template-noir .section-kicker{
  color:#e0bd78!important;
  -webkit-text-fill-color:#e0bd78!important;
}

/* v591 all-template contrast closeout: table headings are semantic client text.
   Each authored header keeps its identity while forcing a proven readable ink. */
.invoice-page.template-signature .items-table thead th{
  background:#f4efe6!important;
  background-image:none!important;
  color:#28343c!important;
  -webkit-text-fill-color:#28343c!important;
}
.invoice-page.template-signature .items-table thead th small{
  color:#46535b!important;
  -webkit-text-fill-color:#46535b!important;
}
.invoice-page.template-cobalt .items-table thead th{
  background:#173f5e!important;
  background-image:none!important;
  color:#fff!important;
  -webkit-text-fill-color:#fff!important;
}
.invoice-page.template-split .items-table thead th{
  background:#102a3c!important;
  background-image:none!important;
  color:#fff!important;
  -webkit-text-fill-color:#fff!important;
}
.invoice-page.template-slate .items-table thead th{
  background:#304852!important;
  background-image:none!important;
  color:#fff!important;
  -webkit-text-fill-color:#fff!important;
}
.invoice-page.template-slate .items-table thead th:last-child{
  background:#6e8791!important;
  color:#101820!important;
  -webkit-text-fill-color:#101820!important;
}
.invoice-page.template-horizon .items-table thead th{
  background:#174d61!important;
  background-image:none!important;
  color:#fff!important;
  -webkit-text-fill-color:#fff!important;
}
.invoice-page.template-horizon .items-table thead th:last-child{
  background:#bc9857!important;
  color:#17130d!important;
  -webkit-text-fill-color:#17130d!important;
}
.invoice-page.template-aurora .items-table thead th{
  background:#24574f!important;
  background-image:none!important;
  color:#fff!important;
  -webkit-text-fill-color:#fff!important;
}
.invoice-page.template-aurora .items-table thead th:last-child{
  background:#4f9187!important;
  color:#10211e!important;
  -webkit-text-fill-color:#10211e!important;
}
.invoice-page.template-ledger .items-table thead th{
  background:#263b49!important;
  background-image:none!important;
  color:#fff!important;
  -webkit-text-fill-color:#fff!important;
}
.invoice-page.template-noir .totals-block .total-row :is(span,strong){
  color:#f4efe6!important;
  -webkit-text-fill-color:#f4efe6!important;
}
.invoice-page.template-blackivory .totals-block .total-row :is(span,strong){
  color:#f5efe2!important;
  -webkit-text-fill-color:#f5efe2!important;
}
`;

const editorFlatteningGuard=`
/* LOUREX Batch 5 — document editor visual flattening.
   The document editor gets one intentional surface per semantic section.
   Pricing, advanced item metadata, document design and watermark controls are
   content inside that surface, not nested cards. This is screen-only: printable
   document paper, PDF output, templates and fixed editor action docks are not
   styled here. */
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card){
  min-width:0!important;
  background:var(--lx485-surface-2)!important;
  color:var(--lx485-text-2)!important;
  border:1px solid var(--lx485-line)!important;
  border-radius:16px!important;
  box-shadow:none!important;
  overflow:hidden!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card)>header,
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card)>.form-grid,
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card)>footer,
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card) .item-core-grid,
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card) .item-pricing-grid,
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card) .item-advanced-control,
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card) .item-advanced-fields{
  min-width:0!important;
  background:transparent!important;
  background-image:none!important;
  box-shadow:none!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card) .item-pricing-grid,
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card) .item-advanced-fields{
  border:0!important;
  border-radius:0!important;
  padding-inline:0!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card) .item-pricing-grid{
  padding-block:10px!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card) .item-advanced-fields{
  margin-top:2px!important;
  padding-block:12px 2px!important;
  border-top:1px solid color-mix(in srgb,var(--lx485-line) 76%,transparent)!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card)>header{
  border-bottom:1px solid color-mix(in srgb,var(--lx485-line) 82%,transparent)!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card)>footer{
  border-top:1px solid color-mix(in srgb,var(--lx485-line) 72%,transparent)!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) .item-advanced-control{
  padding:2px 0!important;
  border:0!important;
  border-radius:0!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) .item-advanced-control>button,
html body #root .app-ui :is(.screen-editor,.editor-screen) .item-card-actions button{
  min-height:44px!important;
  box-shadow:none!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) .item-advanced-control>button{
  background:transparent!important;
  color:var(--lx485-text-2)!important;
  border:1px solid var(--lx485-line)!important;
  border-radius:11px!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) .item-line-total{
  background:transparent!important;
  border:0!important;
  border-radius:0!important;
  padding-inline:0!important;
  color:var(--lx485-text)!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.design-advanced-panel,.document-design-stack,.document-design-group,.document-design-rows,.appearance-system-grid){
  min-width:0!important;
  background:transparent!important;
  background-image:none!important;
  border:0!important;
  border-radius:0!important;
  box-shadow:none!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.watermark-editor-card,.watermark-editor-head,.watermark-editor-body){
  min-width:0!important;
  background:transparent!important;
  background-image:none!important;
  border-radius:0!important;
  box-shadow:none!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) .watermark-editor-card{
  border:0!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) .watermark-editor-head{
  border-inline:0!important;
  border-top:1px solid var(--lx485-line)!important;
  border-bottom:1px solid color-mix(in srgb,var(--lx485-line) 72%,transparent)!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) .watermark-editor-body{
  border:0!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.document-design-control>.input.select,.document-color-control,.watermark-editor-body input,.watermark-editor-body select,.watermark-editor-body button){
  min-height:44px!important;
}
html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.document-design-label,.watermark-editor-card,.item-advanced-fields){
  text-align:start!important;
}
@media screen and (max-width:900px){
  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card) .item-pricing-grid,
  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card) .item-advanced-fields{
    grid-template-columns:minmax(0,1fr)!important;
    gap:9px!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card){border-radius:14px!important;}
  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card) .item-pricing-grid{padding-block:9px!important;}
}
@media screen and (max-width:430px){
  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card)>header,
  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card)>.form-grid,
  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.item-card,.premium-item-card)>footer{
    padding-inline:10px!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .item-card-actions{gap:4px!important;}
}
`;


const documentStudioFinalGuard=`
/* LOUREX v589 — final document studio owner.
   Runs after Batch 5 flattening so editor buttons and Design controls cannot
   inherit a second visual system from older owners. */
@media screen {
  html body #root .app-ui :is(.screen-editor,.editor-screen){
    --lrx-editor-accent:var(--ft-accent,#315DA8);
  }

  html body #root .app-ui :is(.screen-editor,.editor-screen) .btn.btn-primary{
    background:var(--lrx-editor-accent)!important;
    background-image:none!important;
    border-color:var(--lrx-editor-accent)!important;
    color:#fff!important;
    box-shadow:none!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .btn.btn-secondary,
  html body #root .app-ui :is(.screen-editor,.editor-screen) .btn:not(.btn-primary):not(.btn-danger):not(.btn-ghost){
    background:var(--lx485-surface-3,#1d3651)!important;
    background-image:none!important;
    border:1px solid var(--lx485-line-strong,rgba(145,190,247,.34))!important;
    color:var(--lx485-text-2,#cbd8e8)!important;
    box-shadow:none!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .btn.btn-ghost{
    background:var(--lx485-surface-3,#1d3651)!important;
    background-image:none!important;
    border:1px solid var(--lx485-line-strong,rgba(145,190,247,.34))!important;
    color:var(--lx485-text-2,#cbd8e8)!important;
    box-shadow:none!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .icon-btn{
    background:transparent!important;
    background-image:none!important;
    border-color:transparent!important;
    color:var(--lx485-text-2,#cbd8e8)!important;
    box-shadow:none!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.btn,.icon-btn):hover:not(:disabled){
    border-color:color-mix(in srgb,var(--lrx-editor-accent) 52%,var(--ft-line-strong))!important;
  }

  html body #root .app-ui :is(.screen-editor,.editor-screen) .advanced-master-toggle{
    appearance:none!important;
    -webkit-appearance:none!important;
    min-height:44px!important;
    background:var(--lx485-surface-3,#1d3651)!important;
    background-image:none!important;
    border:1px solid var(--lx485-line-strong,rgba(145,190,247,.34))!important;
    color:var(--lx485-text-2,#cbd8e8)!important;
    box-shadow:none!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .advanced-master-toggle:hover,
  html body #root .app-ui :is(.screen-editor,.editor-screen) .advanced-master-toggle:focus-visible{
    background:var(--lx485-surface-2,#172d45)!important;
    border-color:var(--lrx-editor-accent)!important;
    color:var(--lx485-text,#f7faff)!important;
  }

  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(
    .design-advanced-panel,.document-design-stack,.document-design-group,
    .document-design-rows,.appearance-system-grid,.watermark-editor-card,
    .watermark-editor-head,.watermark-editor-body
  ){
    background:transparent!important;
    background-image:none!important;
    border:0!important;
    border-radius:0!important;
    box-shadow:none!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .design-advanced-panel :is(.watermark-editor-card,.watermark-editor-head,.watermark-editor-body){
    background:transparent!important;
    background-image:none!important;
    border:0!important;
    border-radius:0!important;
    box-shadow:none!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .document-design-group+.document-design-group{
    border-top:1px solid var(--ft-line)!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .document-design-row{
    background:transparent!important;
    box-shadow:none!important;
    border-bottom:1px solid color-mix(in srgb,var(--ft-line) 72%,transparent)!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .document-design-note{
    background:transparent!important;
    background-image:none!important;
    border-inline:0!important;
    border-top:0!important;
    border-radius:0!important;
    box-shadow:none!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .document-color-control,
  html body #root .app-ui :is(.screen-editor,.editor-screen) .document-design-control>.input.select{
    background:var(--ft-surface)!important;
    background-image:none!important;
    border:1px solid var(--ft-line-strong)!important;
    color:var(--ft-text-strong)!important;
    box-shadow:none!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .design-mode-badge{
    background:transparent!important;
    border-color:var(--ft-line)!important;
    color:var(--ft-muted)!important;
    box-shadow:none!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) .design-mode-badge.is-custom{
    border-color:color-mix(in srgb,var(--lrx-editor-accent) 48%,var(--ft-line))!important;
    color:var(--lrx-editor-accent)!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(
    .item-advanced-control>button,.watermark-preset-row>button,
    .draft-block-toolbar button,.draft-block-actions button
  ){
    appearance:none!important;
    -webkit-appearance:none!important;
    background:var(--lx485-surface-3,#1d3651)!important;
    background-image:none!important;
    border:1px solid var(--lx485-line-strong,rgba(145,190,247,.34))!important;
    color:var(--lx485-text-2,#cbd8e8)!important;
    box-shadow:none!important;
  }
  /* Native editor buttons that bypass UI.Button must still use the same palette. */
  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(
    .customer-dropdown button,.recent-customer-row button,
    .item-suggestion-box button,.pricing-suggestion-chip,
    .product-metadata-suggestions button,.commercial-preset-chips button,
    .watermark-preset-row button,.attachment-open-button
  ){
    min-height:40px!important;
    background:var(--ft-surface)!important;
    background-image:none!important;
    border:1px solid var(--ft-line)!important;
    color:var(--ft-text-strong)!important;
    box-shadow:none!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(
    .customer-dropdown button,.recent-customer-row button,
    .item-suggestion-box button,.pricing-suggestion-chip,
    .product-metadata-suggestions button,.commercial-preset-chips button,
    .watermark-preset-row button,.attachment-open-button
  ):is(:hover,:focus-visible){
    background:var(--ft-surface-2)!important;
    border-color:color-mix(in srgb,var(--lrx-editor-accent) 52%,var(--ft-line-strong))!important;
    color:var(--ft-text-strong)!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(
    .pricing-suggestion-chip,.product-metadata-suggestions button.active,
    .product-metadata-suggestions button[aria-pressed="true"]
  ){
    background:var(--ft-accent-faint)!important;
    border-color:color-mix(in srgb,var(--lrx-editor-accent) 46%,var(--ft-line))!important;
    color:var(--lrx-editor-accent)!important;
  }

  /* Section 06 is one settings surface: separators, not nested card layers. */
  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.appearance-toggles,.appearance-table-columns){
    background:transparent!important;
    background-image:none!important;
    border:0!important;
    border-radius:0!important;
    box-shadow:none!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.appearance-toggles,.appearance-table-columns) .toggle-row{
    background:transparent!important;
    background-image:none!important;
    border:0!important;
    border-bottom:1px solid color-mix(in srgb,var(--ft-line) 72%,transparent)!important;
    border-radius:0!important;
    box-shadow:none!important;
  }
  html body #root .app-ui :is(.screen-editor,.editor-screen) :is(.appearance-toggles,.appearance-table-columns) .toggle-row:last-child{
    border-bottom:0!important;
  }

}`;

const sourceCss=(await readFile(sourcePath,'utf8')).trim();
if(!sourceCss)throw new Error('v485 visible UI: source stylesheet is empty.');
if(!sourceCss.includes('.ta-doc-type-tabs')||!sourceCss.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'))throw new Error('v485 visible UI: centered mobile document tile grid is missing.');
if(!sourceCss.includes('-webkit-mask-image:none!important')||!sourceCss.includes('overflow:visible!important'))throw new Error('v485 visible UI: clipped document-tab recovery is missing.');
if(!sourceCss.includes('@media screen and (min-width:901px)')||!sourceCss.includes('.ta-finance-dashboard'))throw new Error('v485 visible UI: iPad/desktop premium activation is missing.');
if(!sourceCss.includes('--lx485-canvas:#0a1826')||!sourceCss.includes('--lx485-surface-3:#1d3651'))throw new Error('v485 visible UI: dark hierarchy tokens are missing.');

const css=`${sourceCss}\n${modalInteractionGuard.trim()}\n${editorFlatteningGuard.trim()}\n${editorTemplateControlsGuard.trim()}\n${documentOutputContrastGuard.trim()}\n${documentStudioFinalGuard.trim()}\n`;
if(!css.includes('.app-ui:has(.modal-backdrop) :is(.mobile-editor-actionbar,.draft-mobile-actionbar)'))throw new Error('v485 visible UI: modal/editor action isolation guard is missing.');
if(!css.includes('visibility:hidden!important')||!css.includes('pointer-events:none!important'))throw new Error('v485 visible UI: modal/editor action isolation is incomplete.');
if(!css.includes('LOUREX Batch 5 — document editor visual flattening')||!css.includes('.item-pricing-grid')||!css.includes('.watermark-editor-card'))throw new Error('v485 visible UI: Batch 5 editor flattening guard is missing.');
if(!css.includes('background:transparent!important')||!css.includes('grid-template-columns:minmax(0,1fr)!important')||!css.includes('min-height:44px!important'))throw new Error('v485 visible UI: Batch 5 editor flattening contract is incomplete.');
if(!css.includes('LOUREX v589 — final document studio owner')||!css.includes('.document-design-row')||!css.includes('--rule:#837665'))throw new Error('v485 visible UI: v589 final document studio owner is missing.');

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
