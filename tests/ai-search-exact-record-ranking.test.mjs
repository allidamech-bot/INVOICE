import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createAiToolRuntime,executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';
import {scopeVault} from '../dist/src/lib/workspaces.js';

const context=()=>({screen:'reports',conversationMode:'advisor',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main',entity:null}});
function search(vault,query){
 const plan={version:1,goal:'Find exact scoped record identities',calls:[{id:'search',tool:'search.records',args:{query},reason:'Read only'}]};
 const result=executeAiToolPlan(createAiToolRuntime(scopeVault(vault),context()),plan);
 assert.equal(result.proposal,null);
 assert.equal(result.results[0].ok,true,result.results[0].summary);
 assert.equal(result.results[0].source,'lourex-local-engine');
 assert.ok(Array.isArray(result.results[0].data),'keep existing selection array response shape');
 return result.results[0].data;
}
function base(){
 const v=emptyVault();
 for(let i=0;i<28;i++)v.customers.push({
  id:'qa-customer-'+i,workspaceId:'default',
  companyNameEn:'ACME Customer '+String(i).padStart(2,'0'),companyNameAr:'',
  contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''
 });
 v.savedItems.push({
  id:'exact-sku',workspaceId:'default',sku:'ACME',descriptionEn:'A laboratory widget',descriptionAr:'',
  unit:'PCS',origin:'',hsCode:'',packing:'',lastUnitCost:'10',lastCostCurrency:'USD',
  lastUnitPrice:'20',lastCurrency:'USD',usageCount:0,lastUsedAt:'',
  createdAt:'2026-10-18T00:00:00.000Z',updatedAt:'2026-10-18T00:00:00.000Z'
 });
 const doc=createBlankDocument('invoice','ACME',v.company);
 doc.id='exact-invoice';doc.number='ACME';doc.workspaceId='default';doc.branchId='main';
 v.documents.push(doc);
 return v;
}
test('an exact SKU and exact document number outrank 28 earlier partial customer matches',()=>{
 const v=base(),before=structuredClone(v),rows=search(v,'ACME');
 assert.equal(rows.length,12,'keep existing bounded selection contract');
 assert.deepEqual(rows.slice(0,2).map(x=>[x.type,x.id]),[['product','exact-sku'],['document','exact-invoice']]);
 assert.equal(rows.filter(x=>x.type==='customer').length,10);
 assert.deepEqual(v,before,'search is read-only');
});
test('a query for a metadata KEY never matches records with only an empty field by that name',()=>{
 const v=base();
 for(const q of ['email','phone','hsCode','date']){
   assert.deepEqual(search(v,q),[],q+' is a field key, not an observed record value');
 }
 const copy=structuredClone(v.customers[0]);copy.id='has-contact';copy.companyNameEn='Completely Different';
 copy.email='email@example.test';v.customers.push(copy);
 assert.equal(search(v,'email')[0].id,'has-contact','actual email value remains searchable');
});
test('foreign branch/company and private records remain absent before ranking',()=>{
 const v=base(),wrongBranch=structuredClone(v.documents[0]),wrongCompany=structuredClone(v.savedItems[0]);
 wrongBranch.id='foreign-branch-invoice';wrongBranch.branchId='outside-branch';
 wrongCompany.id='foreign-company-item';wrongCompany.workspaceId='outside-company';
 v.documents.push(wrongBranch);v.savedItems.push(wrongCompany);
 const rows=search(v,'ACME');
 assert.ok(rows.some(x=>x.id==='exact-invoice'));
 assert.ok(rows.some(x=>x.id==='exact-sku'));
 assert.ok(!rows.some(x=>x.id==='foreign-branch-invoice'||x.id==='foreign-company-item'));
});
test('exact customer name matches take precedence over partial matches, without changes to record identities',()=>{
 const v=base(),c=v.customers[27];
 c.companyNameEn='ACME';
 const rows=search(v,'ACME');
 assert.equal(rows[0].id,c.id);
 assert.equal(rows[0].label,'ACME');
 assert.equal(rows[0].type,'customer');
 assert.ok(rows.find(x=>x.id==='exact-sku'));
});
