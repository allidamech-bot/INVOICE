import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(path,'utf8');
const ids=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];

test('commercial A4 has one design owner in source and build',async()=>{
 const [html,canonical,editor,studio,builder,watermark,flatten]=await Promise.all(['index.html','src/styles/document-premium-redesign-v141.css','src/styles/v330-critical-documents-closeout.css','src/styles/v485-visible-ui-corrections.css','scripts/v485-bundle-visible-ui.mjs','src/styles/v337-template-layout-balance.css','scripts/v604-flatten-document-css.mjs'].map(read));
 assert.equal(html.split('href="./styles/document-premium-redesign-v141.css"').length-1,1);
 for(const source of [editor,studio,builder])assert.doesNotMatch(source,/^\.invoice-page/m);
 assert.doesNotMatch(watermark,/v364-document-template-layout-refinement/);
 assert.doesNotMatch(flatten,/v364-document-template-layout-refinement/);
 for(const id of ids)assert.ok(canonical.includes('.template-'+id+'{'),id);
 assert.equal((canonical.match(/\/\* \d{2} /g)||[]).length,18);
});

test('A4 output preserves normal flow, explicit numeric direction and print sizing',async()=>{
 const [css,renderer]=await Promise.all([read('src/styles/document-premium-redesign-v141.css'),read('src/templates/TemplateRenderer.tsx')]);
 assert.match(css,/@page\{size:A4;margin:0\}/);
 assert.match(css,/width:210mm;height:297mm/);
 assert.match(css,/table-layout:fixed/);
 assert.match(css,/font-variant-numeric:tabular-nums/);
 assert.match(css,/\.final-details\{[^}]*margin-top:auto/);
 assert.match(css,/\.doc-footer\{[^}]*min-height:20mm/);
 assert.doesNotMatch(css,/position:absolute[^}]*\.doc-footer|zoom:/);
 assert.match(renderer,/data-pagination-ready/);
 assert.match(renderer,/getBoundingClientRect/);
 assert.match(renderer,/outputItemFragments/);
 assert.match(renderer,/ContinuationHeader/);
});

test('semantic text colors and structural surface pairs share the canonical owner',async()=>{
 const css=await read('src/styles/document-premium-redesign-v141.css');
 for(const role of ['--lrx-primary','--lrx-secondary','--lrx-heading','--art-ink','--table-ink','--footer-ink','--accent-ink'])assert.ok(css.includes(role),role);
 assert.match(css,/\.template-obsidian \.party-block\{[^}]*background:transparent;color:var\(--ink\)/);
 assert.match(css,/\.document-tone-dark \.signature-media\{background:transparent/);
 assert.doesNotMatch(css,/invert\(|brightness\(/);
 assert.match(css,/\.invoice-page\.lang-ar \.items-table\{direction:rtl\}/);
 assert.match(css,/\.invoice-page\.lang-bilingual \.bi-value/);
});
