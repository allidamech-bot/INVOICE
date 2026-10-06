import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const composer=read('public/ai-composer-v449.js');
const stage3=read('scripts/ai-conversation-owner-stage3.mjs');
const presentation=read('scripts/ai-remediation-batch3-conversation-ux.mjs');

test('unified plus opens sources first and nests the full LOUREX AI tool set',()=>{
  assert.match(composer,/Camera/);
  assert.match(composer,/Photos & files/);
  assert.match(composer,/function sourceInput\(panel,camera=false\)/);
  assert.match(composer,/function buildToolsMenu\(panel,menu\)/);
  assert.match(composer,/menu\.dataset\.view='root'/);
  assert.match(composer,/menu\.dataset\.view='tools'/);
  assert.match(composer,/item\('camera',l\.camera,\(\)=>openSource\(true\)\)/);
  assert.match(composer,/item\('files',l\.files,\(\)=>openSource\(false\)\)/);
  assert.match(composer,/item\('tools',l\.toolbox/);
  for(const token of ['AI Inbox','File → Quotation','Product AI','Supplier AI','Ask Anything','Collections','CFO','Compare Supplier Offers','Morning Brief','Memory & Tasks','Business Memory','Accounting Guardian','AI Job History','Advisor Activity']){
    assert.ok(composer.includes(token),`missing nested AI tool: ${token}`);
  }
});

test('React owns the visible plus while v449 owns its menu and voice controls',()=>{
  assert.match(stage3,/className:'lourex-ai-composer-plus'/);
  assert.equal(stage3.includes("className:'lourex-ai-composer-plus','aria-expanded':false"),false,'React must not reset runtime-owned aria-expanded during rerenders');
  assert.match(stage3,/lourex-ai-toggle-plus/);
  assert.match(stage3,/nextMenu\.className='lourex-ai-plus-menu'/);
  assert.match(stage3,/mic\?\.remove\(\);status\?\.remove\(\);menu\?\.remove\(\)/);
  assert.doesNotMatch(stage3,/composer\.replace\(removeControlsToken,"plus\?\.remove/);
  assert.match(stage3,/function __lourexAttachmentMenu\(instance\)\{return null;\}/);
});

test('final conversation palette keeps accessible contrast and local chrome ownership',()=>{
  assert.match(presentation,/--lx-chat-accent:#356edb/,'dark accent is dark enough for white message text');
  assert.match(presentation,/--lx-chat-muted:#686d75/,'light muted copy remains readable on neutral surfaces');
  assert.match(presentation,/--lx-chat-accent-text:#82a9ec/,'dark accent text is separated from filled accent surfaces');
  assert.match(presentation,/--lx-chat-accent-text:#315da8/,'light accent text is separated from filled accent surfaces');
  const css=presentation.slice(presentation.indexOf('LOUREX Remediation Batch 3 — Modern Conversation UX'));
  for(const token of [
    'var(--lx485-muted,var(--ft-muted))',
    'var(--lx485-text,var(--ft-text))',
    'var(--lx485-text-2,var(--ft-text-soft))',
    'var(--lx485-surface,var(--ft-surface))',
    'var(--lx485-surface-2,var(--ft-surface-2))',
    'var(--lx485-line-strong,var(--ft-line-strong))'
  ])assert.equal(css.includes(token),false,`conversation chrome still leaks ${token}`);
  assert.match(css,/\.lourex-ai-scope-button\{min-height:44px!important;height:44px!important/,'mobile scope tabs remain 44px targets');
  assert.match(css,/\.lourex-ai-message-action\{width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important/,'mobile message actions remain 44px targets');
  assert.match(css,/\[dir='rtl'\] \.lourex-ai-plus-item\.is-back \.lourex-ai-plus-icon\{transform:scaleX\(-1\)/,'RTL back affordance mirrors correctly');
  assert.match(css,/\.lourex-ai-plus-menu:is\(\[data-view='root'\],\[data-view='tools'\]\)\{left:8px!important;right:auto!important/,'plus menus stay physically anchored to the left-side + control in both LTR and RTL');
});

test('final conversation owner uses a local neutral palette and sender-side bubbles',()=>{
  assert.match(presentation,/--lx-chat-bg:#0b0c0e/);
  assert.match(presentation,/html\[data-ui-theme='light'\][\s\S]*--lx-chat-bg:#ffffff/);
  assert.match(presentation,/\.lourex-ai-message\.assistant\{[\s\S]*background:transparent!important;color:var\(--lx-chat-text\)!important/);
  assert.match(presentation,/\.lourex-ai-message\.user\{[\s\S]*background:var\(--lx-chat-accent\)!important;color:#fff!important/);
  assert.match(presentation,/\[dir='rtl'\] \.lourex-ai-message\.user\{align-self:flex-end!important/);
  assert.match(presentation,/\.lourex-ai-plus-menu\[data-view='root'\]/);
  assert.match(presentation,/:is\(\.lourex-ai-hub-trigger,\.lourex-ai-hub-menu\)\{display:none!important/);
});
