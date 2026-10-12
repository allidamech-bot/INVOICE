import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const commercial=source('src/components/AiCommercialWorkspace.tsx');
const styles=source('src/styles/ai-conversation-workspace.css');
const workspace=source('src/components/AiConversationWorkspace.tsx');

test('Supplier comparison keeps all recorded fields in mobile two-line rows and expandable evidence',()=>{
  assert.match(commercial,/lxw-supplier-desktop-table/,'large-screen comparison table must remain available');
  assert.match(commercial,/className="lxw-supplier-compact"/);
  assert.match(commercial,/role="listitem"/);
  assert.match(commercial,/r\.supplier\|\|'—'/);
  assert.match(commercial,/r\.unitCost\|\|'—'/);
  assert.match(commercial,/r\.currency\|\|''/);
  assert.match(commercial,/r\.quantity\|\|'—'/);
  assert.match(commercial,/r\.date\|\|'—'/);
  assert.match(commercial,/workspaceText\(ar,r\.reliability\)/);
  assert.match(commercial,/r\.source\|\|'—'/);
  assert.match(commercial,/rows\.slice\(page\*20,page\*20\+20\)\.map\(r=><article/);
  assert.equal((commercial.match(/rows\.slice\(page\*20,page\*20\+20\)/g)||[]).length,2,'desktop and mobile must show the same page');
});

test('Mobile breaks wide supplier table out of horizontal scrolling without suppressing details',()=>{
  assert.match(styles,/@media\(max-width:720px\)\{[\s\S]*?\.lxw-supplier-desktop-table\{display:none;\}/);
  assert.match(styles,/\.lxw-supplier-compact\{display:grid;gap:5px;/);
  assert.match(styles,/\.lxw-supplier-compact-evidence summary/);
  assert.match(styles,/\.lxw-supplier-compact-main b/);
  assert.match(styles,/font-variant-numeric:tabular-nums/);
  assert.match(styles,/\.lxw-supplier-compact-evidence p/);
  assert.match(styles,/overflow-wrap:anywhere/);
});

test('Generic business facts use a compact readable two-column mobile hierarchy',()=>{
  assert.match(workspace,/className="lxw-facts"/);
  assert.match(styles,/\.lxw-facts>div\{display:grid;grid-template-columns:minmax\(86px,\.38fr\) minmax\(0,1fr\)/);
  assert.match(styles,/\.lxw-facts dt\{font-weight:650;font-size:13px/);
  assert.match(styles,/\.lxw-facts dd\{min-width:0;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px/);
  assert.match(styles,/@media\(max-width:360px\)/);
  assert.match(styles,/\.lxw-table-scroll\{overflow:auto;max-width:100%/,'document editing table must preserve horizontal scrolling');
});

test('Design changes stay inside the AI workspace and never change business engine data',()=>{
  assert.match(commercial,/compareSuppliers\(host\.__foundationVault,c\.supplierProductId,c\.sources\)/);
  assert.match(styles,/#lourex-ai-panel\[data-lourex-workspace='2'\]/);
  assert.doesNotMatch(commercial,/mutateVault|saveAssistantState|putRecord/);
});
