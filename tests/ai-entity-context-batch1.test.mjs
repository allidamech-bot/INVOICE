import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('AI Batch 1 binds exact business entities and report filters into structured assistant context',async()=>{
  const [pkg,foundation,entityScript,customer,supplier]=await Promise.all([
    read('package.json'),
    read('src/lib/ai-assistant-foundation.ts'),
    read('scripts/ai-batch1-entity-context-fix.mjs'),
    read('src/components/Customer360LivePanel.tsx'),
    read('src/components/Supplier360LivePanel.tsx')
  ]);
  assert.match(pkg,/ai-batch1-personal-isolation-fix\.mjs && node scripts\/ai-batch1-entity-context-fix\.mjs/);
  assert.match(foundation,/meta\?:Record<string,string>/);
  assert.match(foundation,/currentEntity=\$\{runtime\.entity\.type\}/);
  assert.match(foundation,/Object\.entries\(runtime\.entity\.meta\)/);
  assert.match(customer,/registerAssistantEntity\('customers',\{type:'customer',id:customer\.id/);
  assert.match(supplier,/registerAssistantEntity\('operations',\{type:'supplier',id:supplier\.id/);
  assert.match(entityScript,/type:'product',id:saved\.id/);
  assert.match(entityScript,/type:'purchase',id:savedPurchase\.id/);
  assert.match(entityScript,/type:'report',id:'current-report'/);
  assert.match(entityScript,/from:String\(state\.from\|\|''\)/);
  assert.match(entityScript,/currency:String\(state\.currency\|\|'ALL'\)/);
  assert.match(entityScript,/query:String\(state\.query\|\|''\)/);
  assert.match(entityScript,/registerAssistantEntity\('items',null\)/);
  assert.match(entityScript,/registerAssistantEntity\('operations',null\)/);
  assert.match(entityScript,/registerAssistantEntity\('reports',null\)/);
});
