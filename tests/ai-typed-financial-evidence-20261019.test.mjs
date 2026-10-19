import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {financialReadoutFromToolRows,normalizeFinancialReadout,parseFinancialReadout} from '../dist/src/lib/ai-financial-readout.js';
import {normalizeAssistantState,upsertAssistantThread} from '../dist/src/storage/assistant-store.js';

const evidence=()=>({results:[
 {tool:'document.get',ok:true,class:'read',data:{id:'private-invoice-id',number:'INV-2026-0003',kind:'invoice',status:'final',
  issueDate:'2026-10-16',currency:'USD',customerName:'QA Invoice Buyer',itemCount:24,itemsTruncated:true,
  totals:{subtotal:'3090.00',tax:'309.00',grandTotal:'3399.00'},
  items:Array.from({length:20},(_,i)=>({id:'private-item-id',descriptionEn:'QA Product '+(i+1),descriptionAr:'صنف اختبار '+(i+1),quantity:'10',unit:'PCS',unitPrice:'1.03'}))}},
 {tool:'customer.getSummary',ok:true,class:'read',data:{id:'private-customer-id',name:'QA Invoice Buyer',
  receivables:[{currency:'USD',billed:'3399.00',paid:'399.00',outstanding:'3000.00'}]}},
 {tool:'customer.getHistory',ok:true,class:'read',data:{statements:[{currency:'USD',entries:[
  {type:'invoice',date:'2026-10-16',reference:'INV-2026-0003',debit:'3399.00',balance:'3399.00'},
  {type:'payment',date:'2026-10-16',reference:'QA752-PAY-01 TEST ONLY',credit:'399.00',balance:'3000.00'}
 ]}]}}
]});
test('typed financial evidence comes from tool data, ignores flat answer and does not mutate records',()=>{
 const data=evidence(),before=structuredClone(data);
 for(const lang of ['ar','en']){
  const model=financialReadoutFromToolRows({...data,answer:'fake flattened ### :::lourex-details'},lang);
  assert.ok(model,'typed report must be constructed from read tools');
  assert.match(model.title,/INV-2026-0003/);
  assert.equal(model.party,'QA Invoice Buyer');
  const facts=model.sections.flatMap(s=>s.facts);
  assert.ok(facts.some(row=>row.value==='3399.00 USD'));
  assert.ok(facts.some(row=>row.value==='399.00 USD'));
  assert.ok(facts.some(row=>row.value==='3000.00 USD'));
  assert.ok(model.sections.flatMap(s=>s.movements).some(m=>m.reference==='QA752-PAY-01 TEST ONLY'
   &&m.amount.includes('399.00')&&m.balance.includes('3000.00')));
  assert.ok(model.items.length>=1);
  assert.equal(model.partial,true);
  assert.deepEqual(normalizeFinancialReadout(model),model);
  assert.doesNotMatch(JSON.stringify(model),/private-(invoice|customer|item)-id|:::lourex|###/);
 }
 assert.deepEqual(data,before);
});
test('mixed execution tools or unrelated searches cannot impersonate read-only business snapshots',()=>{
 assert.equal(financialReadoutFromToolRows({results:[...evidence().results,{tool:'payment.create',class:'execute',ok:true}]},'ar'),null);
 assert.equal(financialReadoutFromToolRows({results:[{tool:'product.getSummary',ok:true,data:{}}]},'ar'),null);
 assert.equal(financialReadoutFromToolRows({results:[]},'en'),null);
});
test('messages persist line breaks and bounded typed snapshots in encrypted local store schema',()=>{
 const model=financialReadoutFromToolRows(evidence(),'ar');
 assert.ok(model);
 const state=normalizeAssistantState(null);
 const content='## فاتورة INV-2026-0003\n\n### القيم المالية\n- **الإجمالي النهائي**: 3399.00 USD';
 const result=upsertAssistantThread(state,{threadId:'test-thread',scope:'business',workspaceId:'qa-only',branchId:'test-branch',messages:[
  {id:'m1',role:'user',text:'اعرض الفاتورة'},
  {id:'m2',role:'assistant',text:content,financialReadout:model}
 ]});
 const hydrated=normalizeAssistantState(result.state);
 const saved=hydrated.threads[0].messages[1];
 assert.equal(saved.text,content,'saved message newlines must never be flattened');
 assert.deepEqual(saved.financialReadout,model);
 assert.equal(hydrated.threads[0].workspaceId,'qa-only');
 const malformed=normalizeAssistantState({...hydrated,threads:[{...hydrated.threads[0],messages:[
  {id:'m3',role:'user',text:'Hello',financialReadout:model},
  {id:'m4',role:'assistant',text:'Bad',financialReadout:{...model,items:['x'.repeat(5000)]}}
 ]}]});
 assert.equal(malformed.threads[0].messages[0].financialReadout,undefined);
 assert.equal(malformed.threads[0].messages[1].financialReadout,undefined);
});
test('compiled tool payload transports typed evidence without extracting it from message text',()=>{
 const source=readFileSync('dist/src/components/AiCopilot.js','utf8');
 assert.match(source,/__lourexFinancialReadout: financialReadoutFromToolRows\(toolResult/);
 assert.match(source,/const financialReadout\s*=\s*normalizeFinancialReadout/);
 assert.match(source,/text:\s*answer,\s*\.\.\.\(financialReadout/);
 const workspace=readFileSync('dist/src/components/AiConversationWorkspace.js','utf8');
 assert.match(workspace,/normalizeFinancialReadout\(originalMessage\?\.financialReadout\)\s*\|\|\s*parseFinancialReadout/);
 const cloud=readFileSync('dist/src/cloud/assistant-history.js','utf8');
 assert.match(cloud,/MESSAGE_FIELDS = new Set\(\['id', 'role', 'text', 'createdAt'\]\)/);
 assert.doesNotMatch(cloud,/MESSAGE_FIELDS = new Set\([^)]*financialReadout/);
});
test('legacy messages without typed records can still be interpreted separately',()=>{
 const old='## فاتورة INV-2026-0003\n\n### القيم المالية\n- **الإجمالي النهائي**: 3399.00 USD';
 const legacy=parseFinancialReadout(old);
 assert.ok(legacy);
 assert.equal(legacy.items.length,0);
});
