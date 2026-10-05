import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const rendererTarget='dist/src/templates/TemplateRenderer.js';
const cssTarget='dist/styles/app.bundle.css';
let source=await readFile(rendererTarget,'utf8');
let css=await readFile(cssTarget,'utf8');

if(source.includes('__lourexPdfA4EmergencyV544')||css.includes('LOUREX v544 PDF A4 emergency'))throw new Error('PDF A4 emergency owner is already installed.');

const emptyPageGuard=/if\s*\(\s*!items\.length\s*\|\|\s*this\.moves\+\+\s*>\s*this\.props\.document\.items\.length\s*\*\s*20\s*\+\s*40\s*\)\s*return;/;
if(!emptyPageGuard.test(source))throw new Error('PDF A4 emergency owner could not find the pagination move guard.');
source=source.replace(emptyPageGuard,"if(!items.length)continue;if(this.moves++>this.props.document.items.length*20+40){if(!this.state.ready)this.setState({ready:true});return;}");

const oneRowDeadlock=/if\s*\(\s*!items\.length\s*&&\s*i\s*<\s*pages\.length\s*-\s*1\s*\)\s*\{\s*items\.push\(moved\);\s*return;\s*\}/;
if(!oneRowDeadlock.test(source))throw new Error('PDF A4 emergency owner could not find the one-row pagination deadlock.');
source=source.replace(oneRowDeadlock,'if(!items.length&&i<pages.length-1){items.push(moved);continue;}');

const stableReady=/if\s*\(\s*!this\.state\.ready\s*\)\s*this\.setState\(\{\s*ready:\s*true\s*\}\);/;
if(!stableReady.test(source))throw new Error('PDF A4 emergency owner could not find the pagination-ready transition.');
source=source.replace(stableReady,'if(!this.state.ready){this.moves=0;this.setState({ready:true});}');

source+='\nconst __lourexPdfA4EmergencyV544=true;\n';

css+=`\n/* LOUREX v544 PDF A4 emergency — compact only routine short commercial closes.
   This preserves authored template identity while preventing a three-line quote
   from ejecting its final item/totals to a mostly empty continuation page. */
@media screen, print {
  .invoice-page.page-first:not(.details-only):has(.items-table tbody tr:nth-child(-n+3):last-child) .final-details{padding-top:2.4mm;}
  .invoice-page.page-first:not(.details-only):has(.items-table tbody tr:nth-child(-n+3):last-child) .lower-grid{gap:4mm;}
  .invoice-page.page-first:not(.details-only):has(.items-table tbody tr:nth-child(-n+3):last-child) :is(.terms-block,.bank-block,.signature-block,.notes-block){padding:2.2mm 2.8mm;}
  .invoice-page.page-first:not(.details-only):has(.items-table tbody tr:nth-child(-n+3):last-child) :is(.terms-block,.bank-block,.signature-block,.notes-block)>h3{margin-bottom:1.35mm;}
  .invoice-page.page-first:not(.details-only):has(.items-table tbody tr:nth-child(-n+3):last-child) .terms-grid{gap:.9mm 3mm;}
  .invoice-page.page-first:not(.details-only):has(.items-table tbody tr:nth-child(-n+3):last-child) .totals-block{padding:2.2mm 3mm 2.5mm;}
  .invoice-page.page-first:not(.details-only):has(.items-table tbody tr:nth-child(-n+3):last-child) .total-row{padding:.95mm 0;}
  .invoice-page.page-first:not(.details-only):has(.items-table tbody tr:nth-child(-n+3):last-child) .grand-total{margin-top:1.25mm;padding-top:1.8mm;}
  .invoice-page.page-first:not(.details-only):has(.items-table tbody tr:nth-child(-n+3):last-child) :is(.notes-block,.bottom-grid){margin-top:2mm;}
  .invoice-page.page-first:not(.details-only):has(.items-table tbody tr:nth-child(-n+3):last-child) .signature-media{min-height:16mm;}
  .invoice-page.page-first:not(.details-only):has(.items-table tbody tr:nth-child(-n+3):last-child) .doc-footer{height:9.5mm;}
}
`;

await Promise.all([writeFile(rendererTarget,source),writeFile(cssTarget,css)]);
execFileSync(process.execPath,['--check',rendererTarget],{stdio:'pipe'});
console.log('[LOUREX v544] A4 pagination recovery installed: short commercial closes compact before split and one-row deadlocks cannot stall output readiness.');
