import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');
const TEMPLATE_IDS = ['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];

test('v330 document closeout is registered at the end of the production visual cascade', async () => {
  const [html,bridge] = await Promise.all([
    read('index.html'),
    read('src/styles/tailadmin-reliability-bridge-v320.css')
  ]);
  const closeout = html.indexOf('v330-critical-documents-closeout.css');
  const guard = html.indexOf('v330-template-contrast-guard.css');
  const reliability = html.indexOf('tailadmin-reliability-bridge-v320.css');
  assert.ok(closeout >= 0, 'v330 document closeout stylesheet must be registered');
  assert.ok(guard > closeout, 'template contrast guard must follow the main v330 closeout');
  assert.ok(reliability > guard, 'reliability bridge must remain final after v330 visual layers');
  assert.doesNotMatch(bridge, /@import[^;]*v330/i, 'reliability bridge must remain runtime-only and import-free');
});

test('v330 mobile editor has one vertical scroll owner and no nested editor scroller', async () => {
  const css = await read('src/styles/v330-critical-documents-closeout.css');
  const marker = css.indexOf('/* Mobile document studio');
  assert.ok(marker >= 0, 'mobile document studio closeout block must exist');
  const mobile = css.slice(marker, css.indexOf('@media screen and (max-width:380px)', marker));

  assert.match(mobile, /\.ta-shell\.screen-editor \.ta-main[\s\S]*?overflow-y:auto!important/);
  assert.match(mobile, /\.screen-editor :where\([^)]*\.editor-scroll[^)]*\)[\s\S]*?height:auto!important/);
  assert.match(mobile, /\.screen-editor :where\([^)]*\.editor-scroll[^)]*\)[\s\S]*?overflow:visible!important/);
  assert.match(mobile, /\.screen-editor \.editor-scroll[\s\S]*?touch-action:pan-y!important/);
  assert.doesNotMatch(mobile, /\.screen-editor \.editor-scroll\s*\{[^}]*overflow\s*:\s*(?:auto|scroll)/i);
  assert.doesNotMatch(mobile, /\.screen-editor \.editor-pane\s*\{[^}]*height\s*:\s*100%/i);
});

test('v330 fixes iPhone switch geometry without shrinking the touch row', async () => {
  const css = await read('src/styles/v330-critical-documents-closeout.css');
  assert.match(css, /\.editor-screen \.toggle-row\s*\{[\s\S]*?min-height:44px!important/);
  assert.match(css, /\.toggle-row>\.toggle\s*\{[\s\S]*?width:46px!important[\s\S]*?height:26px!important/);
  assert.match(css, /\.toggle-row>\.toggle>span\s*\{[\s\S]*?width:20px!important[\s\S]*?height:20px!important/);
});

test('v330 keeps editor AI on the physical right edge instead of the header', async () => {
  const css = await read('src/styles/v330-critical-documents-closeout.css');
  const marker = css.indexOf('/* AI belongs on the physical right edge');
  assert.ok(marker >= 0);
  const ai = css.slice(marker, css.indexOf('/* Mobile template gallery', marker));
  assert.match(ai, /position:fixed!important/);
  assert.match(ai, /left:auto!important/);
  assert.match(ai, /right:max\(12px,env\(safe-area-inset-right,0px\)\)!important/);
  assert.match(ai, /top:44%!important/);
});

test('v330 keeps the complete Create Center direct and mobile reachable', async () => {
  const [shell,css] = await Promise.all([
    read('src/components/AppShell.tsx'),
    read('src/styles/v330-critical-documents-closeout.css')
  ]);
  for (const kind of ['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt']) {
    assert.match(shell, new RegExp(`createDocument\\('${kind}'\\)`), `Create Center must retain ${kind}`);
  }
  const createMethod = shell.slice(shell.indexOf('private createDocument='), shell.indexOf('private openCreditNote='));
  assert.match(createMethod, /this\.props\.onNew\(kind\)/);
  assert.doesNotMatch(createMethod, /requestAnimationFrame|setTimeout/);
  assert.match(shell, /onClick=\{this\.openCreditNote\}/);
  assert.match(shell, /onClick=\{this\.openStatementAccount\}/);
  assert.match(css, /\.ta-create-menu-mobile\.new-doc-menu[\s\S]*?max-height:min\(72dvh,680px\)!important[\s\S]*?overflow-y:auto!important/);
});

test('v330 template gallery gives every document template its own art direction',async()=>{
const [selector,artwork,paper]=await Promise.all([read('src/templates/TemplateThumbnails.tsx'),read('src/templates/TemplateArtwork.tsx'),read('src/styles/document-premium-redesign-v141.css')]);
 assert.match(selector,/TemplateArtwork/);
 assert.match(selector,/templateArtPalette/);
 assert.match(selector,/aria-pressed=\{selected\}/);
 for(const id of TEMPLATE_IDS){
  assert.ok(selector.includes("id: '"+id+"'"),'selector missing '+id);
  assert.ok(artwork.includes(id+':{'),'SVG palette missing '+id);
  assert.ok(paper.includes('.invoice-page.template-'+id),'canonical print layout missing '+id);
 }
});

test('v330 printable finish remains data and pagination neutral',async()=>{
const [gallery,guard,paper]=await Promise.all([read('src/styles/v330-critical-documents-closeout.css'),read('src/styles/v330-template-contrast-guard.css'),read('src/styles/document-premium-redesign-v141.css')]);
 assert.match(paper,/\.invoice-page\.template-obsidian\{--paper:#15191c/);
 assert.match(paper,/\.doc-footer\{/);
 assert.match(paper,/\.final-details\{[^}]*margin-top:auto/);
 assert.doesNotMatch(guard,/\.invoice-page\.template-obsidian\{--paper:/);
 assert.doesNotMatch(gallery+guard,/firebase|indexedDB|saveVault|calculateTotals|window\.location/i);
});
