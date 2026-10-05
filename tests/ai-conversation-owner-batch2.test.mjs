import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const owner=read('scripts/ai-conversation-owner.mjs');

test('Batch 2 creates one semantic navigation hierarchy after unified assistant composition',()=>{
  assert.match(owner,/data-lourex-navigation-owner/);
  assert.match(owner,/lourex-ai-context-line/);
  assert.match(owner,/lourex-ai-nav-actions/);
  assert.match(owner,/grid-template-areas:'context actions' 'scopes scopes'/);
  assert.match(owner,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(owner,/navigation=shell\.querySelector\('\.lourex-ai-nav-actions'\)/);
  assert.match(owner,/__lourexConversationOwnerBatch2/);
});

test('Batch 2 keeps LOUREX palette and mobile touch geometry instead of creating a new theme',()=>{
  for(const token of ['--lx485-surface','--lx485-blue','--lx485-line','--lx485-muted'])assert.match(owner,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(owner,/@media\(max-width:720px\)/);
  assert.match(owner,/lourex-ai-scope-button\{min-height:40px!important/);
  assert.match(owner,/lourex-ai-history-button,.lourex-ai-hub-trigger\)\{min-height:44px!important;height:44px!important/);
  assert.match(owner,/lourex-ai-close\{width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important/);
});
