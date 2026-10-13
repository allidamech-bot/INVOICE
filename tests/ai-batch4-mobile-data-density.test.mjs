import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const conversation=read('src/components/AiConversationWorkspace.tsx');
const commercial=read('src/components/AiCommercialWorkspace.tsx');
const css=read('src/styles/ai-conversation-workspace.css');

test('supplier comparison preserves full evidence and currency with compact mobile rows',()=>{
  assert.match(commercial,/lxw-supplier-desktop/);
  assert.match(commercial,/className="lxw-supplier-mobile" role="list"/);
  assert.match(commercial,/className="lxw-supplier-row"/);
  assert.match(commercial,/rows\.slice\(page\*20,page\*20\+20\)\.map\(r=>/);
  assert.match(commercial,/r\.supplier\|\|'—'/);
  assert.match(commercial,/r\.unitCost\|\|'—'/);
  assert.match(commercial,/r\.currency\|\|''/);
  assert.match(commercial,/r\.quantity\|\|'—'/);
  assert.match(commercial,/r\.unit\|\|''/);
  assert.match(commercial,/r\.date\|\|'—'/);
  assert.match(commercial,/workspaceText\(ar,r\.reliability\)/);
  assert.match(commercial,/r\.source\|\|'—'/);
  assert.match(commercial,/<details className="lxw-supplier-evidence">/);
  assert.match(commercial,/compareSuppliers\(host\.__foundationVault,c\.supplierProductId,c\.sources\)/,
    'mobile presentation must not change deterministic supplier comparison');
});

test('mobile product editor uses exact original line ids, revisions and guarded callbacks',()=>{
  assert.match(conversation,/className="lxw-mobile-pricing" role="list"/);
  assert.match(conversation,/className="lxw-price-line" key=\{row\.id\} data-line-id=\{row\.id\}/);
  assert.match(conversation,/fields\.map\(\(field,j\)=>/);
  assert.match(conversation,/kind:'cell',artifactId:doc\.id,revision:doc\.revision,lineId:row\.id,field,value/g);
  assert.match(conversation,/numeric=\{field==='quantity'\|\|field==='unitPrice'\}/);
  assert.match(conversation,/busy=\{disabled\(host\)\}/);
  assert.match(conversation,/doc\.rows\.slice\(page\*10,page\*10\+10\)/);
  assert.match(conversation,/row\[field\]\|\|'—'/);
  assert.match(conversation,/doc\.revision\+':mobile:'/);
  assert.match(conversation,/onCommit=\{value=>dispatch\(host/);
});

test('compact registered facts and pickers do not inflate or hide duplicate identity',()=>{
  assert.match(conversation,/className="lxw-facts lxw-compact-facts"/);
  assert.match(conversation,/<dd dir="auto">\{row\.detail\|\|'—'\}<\/dd>/);
  assert.match(conversation,/rows\.some\(other=>other\.id!==row\.id&&other\.label===row\.label\)/);
  assert.match(conversation,/className="lxw-picker-id"/);
});

test('responsive AI-only selectors keep desktop tables and full values at narrow widths',()=>{
  assert.match(css,/Batch 4 — information density/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/\.lxw-supplier-mobile/);
  assert.match(css,/\.lxw-mobile-pricing/);
  assert.match(css,/\.lxw-supplier-desktop/);
  assert.match(css,/\.lxw-price-line-fields/);
  assert.match(css,/font-size:14px/);
  assert.match(css,/font-size:16px/);
  assert.match(css,/overflow-wrap:anywhere/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.ok(!css.slice(css.indexOf('Batch 4 — information density')).includes('html body .main-site'),
    'visual changes must remain inside the AI panel only');
});
