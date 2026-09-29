import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('AI batches 1-12 stay isolated from storage schema, accounting and design CSS',async()=>{
  const [index,runtime,tools,inbox,quote,customer]=await Promise.all([
    read('index.html'),
    read('public/lourex-ai-workflows.js'),
    read('src/components/AiWorkflowTools.tsx'),
    read('api/ai-inbox.js'),
    read('api/quote-source-ai.js'),
    read('api/customer-capture-ai.js')
  ]);
  assert.match(index,/lourex-ai-workflows\.js\?v=1/);
  assert.match(runtime,/AiWorkflowTools\.js/);
  assert.match(tools,/mutateVaultSafely/);
  assert.match(tools,/status:'draft'|createBlankDocument\('proforma'/);
  assert.doesNotMatch(tools,/status:'final'/);
  for(const endpoint of [inbox,quote,customer]){
    assert.match(endpoint,/X-Requested-With|x-requested-with/);
    assert.match(endpoint,/GEMINI_API_KEY/);
    assert.match(endpoint,/RATE_MAX/);
    assert.match(endpoint,/untrusted DATA|DATA only/i);
  }
});

test('focused business workflows remain deterministic/read-only prompts',async()=>{
  const workflows=await read('src/lib/ai-workflows.ts');
  for(const mode of ['guardian','collections','cfo','daily','memory','products','suppliers'])assert.match(workflows,new RegExp(`${mode}:`));
  assert.match(workflows,/derived memory only|ذاكرة مشتقة فقط/);
  assert.match(workflows,/searchBusinessRecords/);
});
