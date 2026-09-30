import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultCompany } from '../dist/src/lib/defaults.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { buildAiFinanceContext } from '../dist/src/lib/ai-finance.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v450 AI finance product performance keeps an unknown document currency empty',()=>{
  const doc=createBlankDocument('invoice','INV-2026-TEST',defaultCompany());
  doc.status='final';doc.lifecycleStatus='active';doc.role='standard';doc.currency='';doc.issueDate='2026-09-15';doc.dueDate='2026-09-30';
  doc.items=[{...doc.items[0],descriptionEn:'No Currency Product',quantity:'2',unitPrice:'20.00',unitCost:'10.00'}];
  const context=buildAiFinanceContext({documents:[doc],payments:[],customers:[]},'product profitability','2026-09-30');
  const row=context.productLinePerformance?.rows.find(item=>item.name==='No Currency Product');
  assert.ok(row);
  assert.equal(row.currency,'');
  assert.ok(context.limitations.includes('unknown-product-performance-currency-remains-empty'));
});

test('v450 advisor draft sanitizer cannot invent quantity, PCS, customer links or ungrounded commercial terms',async()=>{
  const source=await read('src/components/AiCopilot.tsx');
  assert.match(source,/messageContainsNumber\(message,quantity\)/);
  assert.match(source,/messageContainsText\(message,customer\.name\)/);
  assert.match(source,/safeTermsPatch\(value\.termsPatch,message\)/);
  assert.match(source,/groundedText\(value\.incoterm,message,context\.drafting\.defaults\.incoterm/);
  assert.doesNotMatch(source,/defaultQuantity\?'1'/);
  assert.doesNotMatch(source,/ref\?\.unit\|\|'PCS'/);
  assert.doesNotMatch(source,/unit:entry\.unit\|\|'PCS'/);
  assert.doesNotMatch(source,/smart\.currency\|\|vault\.company\.defaultCurrency\|\|'USD'/);
});

test('v450 advisor reuses saved product prices only for a user-grounded product and matching currency',async()=>{
  const source=await read('src/components/AiCopilot.tsx');
  assert.match(source,/itemReferenceGrounded\(message,candidateRef\)/);
  assert.match(source,/ref&&ref\.lastCurrency&&currency&&ref\.lastCurrency\.toUpperCase\(\)===currency&&ref\.lastUnitPrice===unitPrice/);
  assert.match(source,/messageContainsNumber\(message,unitPrice\)/);
});
