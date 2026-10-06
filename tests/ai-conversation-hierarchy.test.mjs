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
  assert.match(stage3,/lourex-ai-toggle-plus/);
  assert.match(stage3,/nextMenu\.className='lourex-ai-plus-menu'/);
  assert.match(stage3,/mic\?\.remove\(\);status\?\.remove\(\);menu\?\.remove\(\)/);
  assert.doesNotMatch(stage3,/composer\.replace\(removeControlsToken,"plus\?\.remove/);
  assert.match(stage3,/function __lourexAttachmentMenu\(instance\)\{return null;\}/);
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
