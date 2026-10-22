import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createPurchase,createSupplier} from '../dist/src/lib/operations.js';
import {createAiToolRuntime,executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';
import {formatAiToolAnswer} from '../dist/src/lib/ai-tool-client.js';
import {scopeVault} from '../dist/src/lib/workspaces.js';

const context=()=>({screen:'reports',conversationMode:'advisor',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main',entity:null}});
function run(vault,tool,args){
  const plan={version:1,goal:'Read a scoped account summary',calls:[{id:'read',tool,args,reason:'Exact user-selected identity'}]};
  const r=executeAiToolPlan(createAiToolRuntime(scopeVault(vault),context()),plan);
  assert.equal(r.results.length,1);assert.equal(r.results[0].ok,true, r.results[0].summary);
  return {plan,row:r.results[0]};
}
function customerVault(n){
  const v=emptyVault();
  const customer={id:'qa-customer',workspaceId:'default',companyNameEn:'QA Customer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  v.customers=[customer];
  for(let i=0;i<n;i++){
    const d=createBlankDocument('invoice','QA-INV-'+String(i+1).padStart(3,'0'),v.company);
    d.id='qa-invoice-'+i;d.workspaceId='default';d.branchId='main';
    d.status='final';d.lifecycleStatus='active';d.currency='USD';
    d.issueDate='2026-10-18';d.dueDate='2026-11-18';d.customerSnapshot=customerSnapshotFrom(customer);
    d.items=[{id:'qa-row-'+i,descriptionEn:'QA service',descriptionAr:'',quantity:'1',unit:'PCS',unitPrice:'10',unitCost:'',origin:'',packing:'',hsCode:''}];
    v.documents.push(d);
  }
  return v;
}
function supplierVault(n){
  const v=emptyVault(),supplier={...createSupplier(),id:'qa-supplier',nameEn:'QA Supplier'};
  v.suppliers=[supplier];
  for(let i=0;i<n;i++){
    const p=createPurchase(v.purchases,[supplier],'USD');
    p.id='qa-purchase-'+i;p.number='QA-PUR-'+String(i+1).padStart(3,'0');
    p.date='2026-10-18';p.dueDate='2026-11-18';
    p.workspaceId='default';p.branchId='main';
    v.purchases.push(p);
  }
  return v;
}
test('more than eight customer documents disclose correct record counts, scope and full computed receivable',()=>{
  const v=customerVault(11),before=structuredClone(v);
  const other=structuredClone(v.documents[0]);
  other.id='other-branch';other.number='OTHER-BRANCH';other.branchId='other-branch';other.items[0].unitPrice='9000';v.documents.push(other);
  const snapshot=structuredClone(v);
  const {plan,row}=run(v,'customer.getSummary',{customerId:'qa-customer'});
  const d=row.data;
  assert.equal(d.recentDocumentsTotal,11);
  assert.equal(d.recentDocumentsShown,8);
  assert.equal(d.recentDocumentsIncomplete,true);
  assert.equal(d.recentDocuments.length,8);
  assert.equal(d.receivables[0].billed,'110.00');
  assert.equal(d.receivables[0].outstanding,'110.00');
  assert.doesNotMatch(JSON.stringify(d),/OTHER-BRANCH/);
  for(const language of ['ar','en']){
    const answer=formatAiToolAnswer(plan,[row],language);
    assert.match(answer,language==='ar'?/المستندات الأخيرة جزئية/:/recent document list is partial/);
    assert.match(answer,/8/);assert.match(answer,/11/);
  }
  assert.deepEqual(v,snapshot,'a named read cannot change the source vault');
  assert.equal(before.documents.length,11);
});
test('more than eight supplier purchases disclose partial list, without inventing any outstanding payable',()=>{
  const v=supplierVault(11),before=structuredClone(v);
  const {plan,row}=run(v,'supplier.getSummary',{supplierId:'qa-supplier'});
  const d=row.data;
  assert.equal(d.recentPurchasesTotal,11);
  assert.equal(d.recentPurchasesShown,8);
  assert.equal(d.recentPurchasesIncomplete,true);
  assert.equal(d.recentPurchases.length,8);
  assert.deepEqual(d.payables,[],'draft purchases are not posted supplier obligations');
  const ar=formatAiToolAnswer(plan,[row],'ar'),en=formatAiToolAnswer(plan,[row],'en');
  assert.match(ar,/المشتريات الأخيرة جزئية/);
  assert.match(en,/recent purchase list is partial/);
  assert.match(en,/8 of 11/);
  assert.deepEqual(v,before);
});
test('exactly eight entries are complete and produce no false partial-list warning',()=>{
  for(const [vault,tool,args,key] of [
    [customerVault(8),'customer.getSummary',{customerId:'qa-customer'},'recentDocuments'],
    [supplierVault(8),'supplier.getSummary',{supplierId:'qa-supplier'},'recentPurchases']
  ]){
    const {plan,row}=run(vault,tool,args);
    assert.equal(row.data[key+'Total'],8);assert.equal(row.data[key+'Shown'],8);
    assert.equal(row.data[key+'Incomplete'],false);
    assert.doesNotMatch(formatAiToolAnswer(plan,[row],'en'),/recent (?:document|purchase) list is partial/);
  }
});
