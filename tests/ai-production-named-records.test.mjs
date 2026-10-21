import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createManualInventoryMovement} from '../dist/src/lib/operations.js';
import {createAiToolRuntime,executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';
import {orchestrateAiToolRequest,formatAiToolAnswer} from '../dist/src/lib/ai-tool-client.js';
import {namedRecordReadPlan} from '../dist/src/lib/ai-named-record-read.js';

const now='2026-10-18T00:00:00.000Z';
function fixture(){
 const v=emptyVault();
 const c={id:'qa-customer-id',workspaceId:'default',companyNameEn:'LOUREX QA TEST',companyNameAr:'عميل اختبار قبول لوريكس',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',createdAt:now,updatedAt:now};
 v.customers=[c];
 const p={id:'qa-product-id',workspaceId:'default',sku:'QA-ACCEPT-001',descriptionEn:'Production Acceptance Test Product',descriptionAr:'منتج اختبار القبول الإنتاجي',unit:'PCS',hsCode:'',origin:'',packing:'',lastUnitPrice:'100',lastCurrency:'USD',lastUnitCost:'40',lastCostCurrency:'USD',usageCount:0,lastUsedAt:'',createdAt:now,updatedAt:now};
 v.savedItems=[p];v.inventoryMovements=[createManualInventoryMovement(p,'opening','7',undefined,'Synthetic fixture balance')];
 const invoice=(number,amount,customer=c,branchId='main')=>{
  const d=createBlankDocument('invoice',number,v.company);d.id=number;d.workspaceId=customer.workspaceId;d.branchId=branchId;d.status='final';d.lifecycleStatus='active';d.currency='USD';d.customerSnapshot=customerSnapshotFrom(customer);d.issueDate='2026-10-18';d.dueDate='2026-12-01';d.items=[{...d.items[0],descriptionEn:'QA item',quantity:'1',unitPrice:amount}];return d;
 };
 const a=invoice('QA-ACCEPT-INV-20261018','200'),b=invoice('QA-ACCEPT-VOID-20261018','100');
 v.documents=[a,b,invoice('HIDDEN-BRANCH-INVOICE','9000',c,'other-branch')];
 v.payments=[{id:'qa-payment',workspaceId:'default',branchId:'main',invoiceId:a.id,invoiceNumber:a.number,customerId:c.id,customerNameEn:c.companyNameEn,customerNameAr:c.companyNameAr,currency:'USD',amount:'50',date:'2026-10-18',method:'bank-transfer',reference:'QA-ACCEPT-PAY',notes:'',createdAt:now,updatedAt:now}];
 return v;
}
const context=()=>({screen:'reports',conversationMode:'advisor',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main',entity:null}});
async function read(v,message,language='en',ctx=context()){
 const before=structuredClone(v),fetch=globalThis.fetch;
 globalThis.fetch=async()=>{throw new Error('Exact named reads must not depend on provider planning');};
 try{
  const result=await orchestrateAiToolRequest({message,vault:v,context:ctx,language});
  assert.ok(result,'expected a grounded local read, not generic dialogue');
  assert.equal(result.plannedBy,'local');assert.equal(result.proposal,null);
  assert.ok(result.results.length);assert.ok(result.results.every(r=>r.class==='read'));
  assert.deepEqual(v,before,'read-only request must not mutate business records');return result;
 }finally{globalThis.fetch=fetch;}
}

test('production QA customer balances resolve from English and Arabic named questions with negated writes',async()=>{
 for(const [q,lang] of [
  ['What is the outstanding balance of customer LOUREX QA TEST? Do not modify anything.','en'],
  ['اعرض رصيد العميل LOUREX QA TEST فقط من سجلات الحساب الحالية، دون أي تعديل.','ar'],
  ['ما الرصيد المستحق للعميل عميل اختبار قبول لوريكس؟ لا تعدّل أي شيء.','ar']
 ]){
  const r=await read(fixture(),q,lang),data=r.results.find(x=>x.tool==='customer.getSummary')?.data;
  assert.equal(data?.id,'qa-customer-id');
  assert.equal(data.receivables[0].billed,'300.00');assert.equal(data.receivables[0].paid,'50.00');assert.equal(data.receivables[0].outstanding,'250.00');
  assert.equal(data.recentDocuments.length,2,'foreign branch invoice excluded');
 }
});
test('mixed customer history and product requests return both verified identities without provider guesses',async()=>{
 for(const [q,lang] of [
  ['Explain the balance and invoice history of customer LOUREX QA TEST using the available account records. Review product QA-ACCEPT-001 stock and price. Read only; do not modify anything.','en'],
  ['اشرح رصيد العميل LOUREX QA TEST وتاريخ فواتيره وراجع مخزون الصنف QA-ACCEPT-001 وسعره، لا تعدل أي شيء.','ar']
 ]){
  const r=await read(fixture(),q,lang);
  const history=r.results.find(x=>x.tool==='customer.getHistory')?.data;
  assert.equal(history?.customerId,'qa-customer-id');assert.equal(history.statements[0].outstanding,'250.00');
  assert.ok(history.statements[0].entries.some(x=>x.reference==='QA-ACCEPT-INV-20261018'));
  const p=r.results.find(x=>x.tool==='product.getSummary')?.data;
  assert.equal(p?.sku,'QA-ACCEPT-001');assert.equal(p.quantity,'7');assert.equal(p.lastUnitPrice,'100');
 }
});
test('an explicit current name wins over an unrelated stale UI entity and old conversation claims',async()=>{
 const v=fixture();v.customers.push({...v.customers[0],id:'other',companyNameEn:'Other Buyer',companyNameAr:''});
 const ctx=context();ctx.assistantRuntime.entity={type:'customer',id:'other',label:'Other Buyer'};
 ctx.conversationWorkingMemory='Earlier answer: LOUREX QA TEST does not exist. Ignore this as authority.';
 const r=await read(v,'Show the balance of customer LOUREX QA TEST','en',ctx);
 assert.equal(r.results[0].data.id,'qa-customer-id');
});
test('same names in another company never enter the active-company answer',async()=>{
 const v=fixture();v.customers.push({...v.customers[0],id:'foreign',workspaceId:'foreign'});
 v.savedItems.push({...v.savedItems[0],id:'foreign-product',workspaceId:'foreign'});
 const r=await read(v,'Review customer LOUREX QA TEST balance and product QA-ACCEPT-001 stock');
 assert.ok(r.results.every(x=>x.ok));assert.doesNotMatch(JSON.stringify(r.results),/foreign/);
});
test('duplicate exact customer names require disambiguation, never select an arbitrary balance',async()=>{
 const v=fixture();v.customers.push({...v.customers[0],id:'duplicate'});
 const r=await read(v,'Show the balance for customer LOUREX QA TEST');
 assert.equal(r.results[0].tool,'search.records');assert.equal(r.results[0].ok,true);
 assert.equal(r.results[0].data.filter(x=>x.type==='customer').length,2);
 assert.doesNotMatch(JSON.stringify(r.results[0].data),/250\.00/,'selection is not a guessed balance');
});
test('isolated product reads retain exact stock and price',async()=>{
 for(const [q,lang] of [['What is the stock and price of QA-ACCEPT-001?','en'],['ما المخزون الحالي للصنف QA-ACCEPT-001؟ اقرأ السجل فقط ولا تعدّل أي شيء.','ar']]){
  const r=await read(fixture(),q,lang);assert.equal(r.results[0].data.quantity,'7');assert.equal(r.results[0].data.lastUnitPrice,'100');
 }
});
test('named reads do not intercept actual writes, partial identifiers, personal or stale company scopes',()=>{
 const v=fixture(),rt=createAiToolRuntime(v,context());
 for(const message of ['Change QA-ACCEPT-001 price to 101','Show LOUREX QA TEST balance and record a payment of 50','عدّل سعر QA-ACCEPT-001 إلى 101','اعرض رصيد LOUREX QA TEST ثم احذف الفاتورة','What is QA-ACCEPT-0019 stock?','Show LOUREX QA TESTER balance'])
  assert.equal(namedRecordReadPlan(message,rt),null,message);
 for(const patch of [{scope:'personal'},{scope:'temporary'},{workspaceId:'other'},{branchId:'other'}])
  assert.equal(namedRecordReadPlan('Show LOUREX QA TEST balance',{...rt,...patch}),null);
});
test('the active branch and customer source ID determine history; currencies stay separate',async()=>{
 const v=fixture(),euro=structuredClone(v.documents[0]);
 euro.id='EUR-INVOICE';euro.number='EUR-INVOICE';euro.currency='EUR';euro.items[0].unitPrice='70';v.documents.push(euro);
 const other=structuredClone(v.documents[0]);other.id='UNRELATED';other.number='UNRELATED';other.customerSnapshot.sourceCustomerId='another-id';v.documents.push(other);
 const r=await read(v,'Review LOUREX QA TEST balance and invoice history');
 const customer=r.results[0].data;
 assert.equal(customer.receivables.find(x=>x.currency==='USD').outstanding,'250.00');
 assert.equal(customer.receivables.find(x=>x.currency==='EUR').outstanding,'70.00');
 assert.equal(customer.recentDocuments.length,3);
 assert.ok(customer.recentDocuments.every(x=>x.number!=='UNRELATED'));
});
test('existing exact-ID tools remain strict: a name is not an ID and a read never authorizes a mutation',()=>{
 const v=fixture(),rt=createAiToolRuntime(v,context()),before=structuredClone(v);
 const execution=executeAiToolPlan(rt,{version:1,goal:'Invalid provider identity',calls:[{id:'1',tool:'customer.getSummary',args:{customerId:'LOUREX QA TEST'},reason:'Name incorrectly supplied as ID'}]});
 assert.equal(execution.results[0].ok,false);assert.match(execution.results[0].summary,/not found/);
 assert.equal(execution.proposal,null);assert.deepEqual(v,before);
});
test('named reads require explicit workspace and branch identity, not an implicit active fallback',()=>{
 const v=fixture(),rt=createAiToolRuntime(v,context()),message='Show LOUREX QA TEST balance and QA-ACCEPT-001 stock';
 assert.ok(namedRecordReadPlan(message,rt));
 for(const bad of [{workspaceId:''},{branchId:''},{workspaceId:'different-company'},{branchId:'different-branch'}]){
   assert.equal(namedRecordReadPlan(message,{...rt,...bad}),null,JSON.stringify(bad));
 }
});

test('record visibility applies to local and provider-selected customer/product reads and search',()=>{
 const v=fixture(),before=structuredClone(v);
 v.teamMembers=[{id:'buyer-qa',role:'purchasing',status:'active',displayName:'QA buyer'}];
 v.appSettings.activeTeamMemberId='buyer-qa';
 const rt=createAiToolRuntime(v,context());
 const plan=namedRecordReadPlan('Review customer LOUREX QA TEST balance and product QA-ACCEPT-001 stock',rt);
 assert.deepEqual(plan.calls.map(x=>x.tool),['customer.getSummary','product.getSummary']);
 const local=executeAiToolPlan(rt,plan);
 assert.equal(local.results[0].ok,false);
 assert.equal(local.results[0].source,'operator-read-guard');
 assert.equal(local.results[0].data,null);
 assert.equal(local.results[1].ok,true);
 assert.equal(local.results[1].data.sku,'QA-ACCEPT-001');
 const provider=executeAiToolPlan(rt,{version:1,goal:'provider-selected identity',calls:[
   {id:'customer-provider',tool:'customer.getHistory',args:{customerId:'qa-customer-id'},reason:'read history'},
   {id:'product-provider',tool:'product.getSummary',args:{itemId:'qa-product-id'},reason:'read stock'}
 ]});
 assert.equal(provider.results[0].ok,false);
 assert.equal(provider.results[0].data,null);
 assert.equal(provider.results[1].ok,true);
 const search=executeAiToolPlan(rt,{version:1,goal:'search records',calls:[{id:'search',tool:'search.records',args:{query:'LOUREX QA TEST'},reason:'search'}]});
 assert.equal(search.results[0].ok,true);
 assert.deepEqual(search.results[0].data,[]);
 assert.deepEqual(v,{...before,teamMembers:v.teamMembers,appSettings:v.appSettings},'no business mutations from read-only tools');
});

test('actual provider planner supplies the named-read argument contract to both conversation modes',async()=>{
 const source=readFileSync('api/ai-inbox.js','utf8');
 const start=source.indexOf('async function handleToolPlan('),end=source.indexOf('\nexport default',start);
 assert.ok(start>=0&&end>start);
 for(const mode of ['advisor','controller']){
  let prompt='';
  const sandbox={
   cleanText:(value,max)=>String(value??'').slice(0,max),cleanToolPlannerSources:()=>[],
   plannerToolIds:()=>['customer.getSummary','customer.getHistory','product.getSummary'],
   TOOL_GUIDE:{},routeAiStructured:async input=>{prompt=input.prompt;return{success:true,data:{version:1,calls:[]}};},
   cleanToolPlan:value=>value,sendJson:(response,status,payload)=>Object.assign(response,{status,payload})
  };
  vm.createContext(sandbox);vm.runInContext(source.slice(start,end),sandbox);
  const response={};await sandbox.handleToolPlan({message:'Review customer LOUREX QA TEST and product QA-ACCEPT-001',scope:'business',conversationMode:mode},response,'owner');
  assert.equal(response.status,200);
  assert.match(prompt,/READ ARGUMENTS \(Advisor and Controller\)/);
  assert.match(prompt,/"query":"exact customer name from the request"/);
  assert.match(prompt,/"sku":"exact SKU"/);
  assert.match(prompt,/Names\/SKUs are NOT IDs/);
  assert.match(prompt,/NO Vault records, balances/);
 }
});


function numberedInvoiceFixture(){
 const v=fixture(),customer=v.customers[0];
 customer.companyNameEn='QA Invoice Buyer';
 const doc=v.documents[0];
 doc.id='qa-issued-invoice';doc.number='INV-2026-0003';doc.issueDate='2026-10-16';
 doc.customerSnapshot=customerSnapshotFrom(customer);
 doc.items[0].unitPrice='3399';
 v.documents=[doc];
 v.payments=[{...v.payments[0],invoiceId:doc.id,invoiceNumber:doc.number,
  customerId:customer.id,customerNameEn:customer.companyNameEn,amount:'399',
  reference:'QA-PAY-399',date:'2026-10-18'}];
 return v;
}
const exactInvoiceQuestion='ابحث في سجلات LOUREX عن الفاتورة رقم INV-2026-0003. أريد قراءة فعلية من النظام توضح اسم العميل المسجل، وتاريخ إصدارها، وقيمتها والضريبة والإجمالي النهائي، والمدفوعات المرتبطة بها مع التواريخ والمراجع، والرصيد المستحق. لا تستخدم معلومات المحادثات السابقة، وإذا لم تتمكن من قراءة معلومة فلا تخترعها. لا تعدّل أي بيانات.';
test('exact Arabic numbered-invoice question reads document and linked posted customer receipts, not status-only dialogue',async()=>{
 const v=numberedInvoiceFixture(),result=await read(v,exactInvoiceQuestion,'ar');
 assert.deepEqual(result.results.map(row=>row.tool),[
  'document.get','customer.getSummary','customer.getHistory']);
 assert.ok(result.results.every(row=>row.ok&&row.source==='lourex-local-engine'));
 const invoice=result.results[0].data,customer=result.results[1].data,history=result.results[2].data;
 assert.equal(invoice.number,'INV-2026-0003');
 assert.equal(invoice.customerName,'QA Invoice Buyer');
 assert.equal(invoice.issueDate,'2026-10-16');
 assert.equal(invoice.totals.grandTotal,'3399.00');
 assert.equal(customer.receivables[0].billed,'3399.00');
 assert.equal(customer.receivables[0].paid,'399.00');
 assert.equal(customer.receivables[0].outstanding,'3000.00');
 assert.ok(history.statements[0].entries.some(row=>row.type==='payment'&&
  row.reference==='QA-PAY-399'&&row.credit==='399.00'&&
  row.relatedInvoiceNumber==='INV-2026-0003'));
 assert.match(result.answer,/INV-2026-0003/);
 assert.match(result.answer,/QA-PAY-399/);
});
test('English invoice-detail question and explicit customer name yield the same scoped ledger',async()=>{
 const v=numberedInvoiceFixture();
 const r=await read(v,'Show the detailed issued invoice INV-2026-0003 for customer QA Invoice Buyer, including all posted payments, balance and invoice date. Read only; do not change any data.','en');
 assert.deepEqual(r.results.map(row=>row.tool),['document.get','customer.getSummary','customer.getHistory']);
 assert.equal(r.results[0].data.customerName,'QA Invoice Buyer');
 assert.equal(r.results[2].data.statements[0].outstanding,'3000.00');
});
test('invoice-number reads do not trust stale UI entities, other branches or a model planner',async()=>{
 const v=numberedInvoiceFixture(),ctx=context();
 ctx.assistantRuntime.entity={type:'document',id:'wrong-id',label:'Unrelated invoice'};
 const remote=structuredClone(v.documents[0]);remote.id='different-branch-doc';remote.branchId='other-branch';remote.items[0].unitPrice='99999';v.documents.push(remote);
 const out=await read(v,exactInvoiceQuestion,'ar',ctx);
 assert.equal(out.results[0].data.id,'qa-issued-invoice');
 assert.equal(out.results[1].data.receivables[0].outstanding,'3000.00');
 assert.doesNotMatch(JSON.stringify(out.results),/99999|different-branch-doc/);
});
test('invoice details fail closed when exact number is absent or duplicated in scope',()=>{
 const v=numberedInvoiceFixture(),rt=createAiToolRuntime(v,context());
 const missing=namedRecordReadPlan('اعرض تفاصيل الفاتورة INV-2026-9999',rt);
 assert.deepEqual(missing.calls.map(row=>row.tool),['document.get']);
 assert.equal(executeAiToolPlan(rt,missing).results[0].ok,false);
 v.documents.push({...v.documents[0],id:'duplicate-number'});
 const duplicate=namedRecordReadPlan('اعرض تفاصيل الفاتورة INV-2026-0003',createAiToolRuntime(v,context()));
 assert.deepEqual(duplicate.calls.map(row=>row.tool),['search.records']);
});
test('numbered invoice details honor workspace, branch and operator read permissions',()=>{
 const v=numberedInvoiceFixture(),rt=createAiToolRuntime(v,context());
 for(const patch of [{scope:'personal'},{scope:'temporary'},{workspaceId:''},{branchId:''},{workspaceId:'other'},{branchId:'other'}])
  assert.equal(namedRecordReadPlan(exactInvoiceQuestion,{...rt,...patch}),null);
 v.teamMembers=[{id:'restricted',role:'purchasing',status:'active',displayName:'Purchasing'}];
 v.appSettings.activeTeamMemberId='restricted';
 const restricted=createAiToolRuntime(v,context()),plan=namedRecordReadPlan(exactInvoiceQuestion,restricted);
 assert.deepEqual(plan.calls.map(row=>row.tool),['document.get']);
 const result=executeAiToolPlan(restricted,plan);
 assert.equal(result.results[0].ok,false);
 assert.equal(result.results[0].source,'operator-read-guard');
 assert.equal(result.results[0].data,null);
});
test('invoice and customer read parser rejects mutations but not the nouns سجل or سجلات',()=>{
 const rt=createAiToolRuntime(numberedInvoiceFixture(),context());
 for(const q of [
  'سجّل تحصيلًا للفـاتورة INV-2026-0003 بقيمة 25',
  'سجل دفعة للفاتورة INV-2026-0003 بقيمة 25',
  'Update invoice INV-2026-0003 total to 5000',
  'احذف الفاتورة INV-2026-0003',
  'أصدر الفاتورة INV-2026-0003'
 ])assert.equal(namedRecordReadPlan(q,rt),null,q);
 assert.deepEqual(namedRecordReadPlan('اعرض سجل المدفوعات للفاتورة INV-2026-0003 ولا تفترض أن كل الدفعات حدثت اليوم',rt).calls.map(row=>row.tool),
 ['document.get','customer.getSummary','customer.getHistory']);
});

test('customer history explicitly reports omitted older entries without changing complete ledger totals',()=>{
  const v=fixture();
  for(let i=0;i<13;i++){
    const row=structuredClone(v.documents[0]);
    row.id='QA-HISTORY-'+i;
    row.number='QA-HISTORY-'+i;
    row.issueDate='2026-10-17';
    row.items[0].unitPrice='10';
    v.documents.push(row);
  }
  const before=structuredClone(v);
  const runtime=createAiToolRuntime(v,context());
  const plan={version:1,goal:'Read history',calls:[{id:'history',tool:'customer.getHistory',args:{customerId:'qa-customer-id'},reason:'Grounded ledger'}]};
  const result=executeAiToolPlan(runtime,plan);
  const row=result.results[0];
  assert.equal(row.ok,true);
  const usd=row.data.statements.find(x=>x.currency==='USD');
  assert.equal(usd.entriesTotal,16,'2 original invoices + 1 payment + 13 added invoices');
  assert.equal(usd.entriesShown,12);
  assert.equal(usd.incomplete,true);
  assert.equal(usd.entries.length,12);
  assert.equal(usd.billed,'430.00');
  assert.equal(usd.paid,'50.00');
  assert.equal(usd.outstanding,'380.00');
  const ar=formatAiToolAnswer(plan,result.results,'ar');
  const en=formatAiToolAnswer(plan,result.results,'en');
  assert.match(ar,/كشف جزئي/);
  assert.match(ar,/12/);
  assert.match(ar,/16/);
  assert.match(en,/Partial history/);
  assert.match(en,/12/);
  assert.match(en,/16/);
  assert.deepEqual(v,before,'read must never mutate original invoices or payments');
});
test('short customer history does not falsely warn of omitted entries',()=>{
  const v=fixture(),runtime=createAiToolRuntime(v,context());
  const plan={version:1,goal:'Read history',calls:[{id:'history',tool:'customer.getHistory',args:{customerId:'qa-customer-id'},reason:'Read full available ledger'}]};
  const out=executeAiToolPlan(runtime,plan);
  const usd=out.results[0].data.statements.find(x=>x.currency==='USD');
  assert.equal(usd.entriesTotal,3);
  assert.equal(usd.entriesShown,3);
  assert.equal(usd.incomplete,false);
  assert.doesNotMatch(formatAiToolAnswer(plan,out.results,'en'),/Partial history/);
});
