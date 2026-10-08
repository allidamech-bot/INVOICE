import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {assertAiDocumentCreateApproval,assertAiDocumentUpdateApproval} from '../dist/src/lib/ai-document-approval-guard.js';

function vault(){
 const v=emptyVault();
 v.customers=[{id:'cust-a',workspaceId:'default',companyNameEn:'Coastal LLC',companyNameAr:'',email:'buyer@example.test'},
 {id:'cust-other',workspaceId:'other',companyNameEn:'Outside',companyNameAr:'',email:'outside@example.test'}];
 v.savedItems=[{id:'sku-a',workspaceId:'default',sku:'A-50',descriptionEn:'Biscuits 50g',descriptionAr:'',lastUnitPrice:'12.50',lastCurrency:'USD',archived:false},
 {id:'sku-other',workspaceId:'other',sku:'B-50',descriptionEn:'Other biscuits 50g',descriptionAr:'',lastUnitPrice:'12.50',lastCurrency:'USD',archived:false}];
 v.documents=[{id:'draft-a',workspaceId:'default',status:'draft',lifecycleStatus:'active',currency:'USD',items:[{id:'line-1',descriptionEn:'Biscuits 50g',quantity:'10',unitPrice:'12.50'}]},
 {id:'draft-other',workspaceId:'other',status:'draft',lifecycleStatus:'active',currency:'USD',items:[]}];
 return v;
}
const draft=(items=[{savedItemId:'sku-a',quantity:'10',unitPrice:'12.50'}],customerId='cust-a')=>({currency:'USD',items,customerId,customerDraft:null});
test('B06: exact customer, product, quantity and currency are accepted for draft review',()=>{
 const v=vault();
 assert.doesNotThrow(()=>assertAiDocumentCreateApproval(v,draft()));
 assert.doesNotThrow(()=>assertAiDocumentCreateApproval(v,draft([{savedItemId:'sku-a',quantity:'2'}])));
 assert.doesNotThrow(()=>assertAiDocumentCreateApproval(v,draft([{descriptionEn:'Explicit sample',quantity:'1.5',unitPrice:'0'}])));
});
test('B06: cross-company customer/product and missing stored price fail before atomic save',()=>{
 const v=vault();
 assert.throws(()=>assertAiDocumentCreateApproval(v,draft(undefined,'cust-other')),/active company/);
 assert.throws(()=>assertAiDocumentCreateApproval(v,draft([{savedItemId:'sku-other',quantity:'10',unitPrice:'12.50'}])),/active company/);
 assert.throws(()=>assertAiDocumentCreateApproval(v,draft([{savedItemId:'deleted-id',quantity:'10',unitPrice:'12.50'}])),/unavailable/);
 v.savedItems[0].lastCurrency='SAR';
 assert.throws(()=>assertAiDocumentCreateApproval(v,draft([{savedItemId:'sku-a',quantity:'1'}])),/price or currency changed/);
});
test('B06: invalid amount or unknown unregistered product name cannot silently save',()=>{
 const v=vault();
 for(const quantity of ['0','-1','xyz','', '5e2'])assert.throws(()=>assertAiDocumentCreateApproval(v,draft([{savedItemId:'sku-a',quantity,unitPrice:'10'}])),/positive quantity/);
 for(const unitPrice of ['-1','NaN','Infinity','1e2'])assert.throws(()=>assertAiDocumentCreateApproval(v,draft([{savedItemId:'sku-a',quantity:'1',unitPrice}])),/invalid selling price/);
 assert.throws(()=>assertAiDocumentCreateApproval(v,draft([{savedItemId:'',descriptionEn:'',quantity:'1',unitPrice:'3'}])),/explicit description/);
 assert.throws(()=>assertAiDocumentCreateApproval(v,draft([{savedItemId:'',descriptionEn:'New item',quantity:'1',unitPrice:''}])),/explicit selling price/);
 assert.throws(()=>assertAiDocumentCreateApproval(v,draft(Array.from({length:21},()=>({savedItemId:'sku-a',quantity:'1',unitPrice:'1'})))),/item count/);
});
test('B06: new customer data cannot accidentally duplicate existing business',()=>{
 const v=vault();
 assert.throws(()=>assertAiDocumentCreateApproval(v,{...draft(),customerId:'',customerDraft:{companyNameEn:'Coastal LLC'}}),/already exists/);
 assert.throws(()=>assertAiDocumentCreateApproval(v,{...draft(),customerId:'',customerDraft:{companyNameEn:'New company',email:'buyer@example.test'}}),/already exists/);
 assert.doesNotThrow(()=>assertAiDocumentCreateApproval(v,{...draft(),customerId:'',customerDraft:{companyNameEn:'New company',email:'new@example.test'}}));
});
test('B06: current-company draft may be edited, finalized or other-company document cannot',()=>{
 const v=vault();
 assert.doesNotThrow(()=>assertAiDocumentUpdateApproval(v,{documentId:'draft-a',addItems:[{savedItemId:'sku-a',quantity:'3',unitPrice:'12.50'}],itemEdits:[{itemId:'line-1',quantity:'5'}]}));
 assert.throws(()=>assertAiDocumentUpdateApproval(v,{documentId:'draft-other',addItems:[],itemEdits:[]}),/current company/);
 assert.throws(()=>assertAiDocumentUpdateApproval(v,{documentId:'gone',addItems:[],itemEdits:[]}),/unavailable/);
 v.documents[0].status='final';
 assert.throws(()=>assertAiDocumentUpdateApproval(v,{documentId:'draft-a',addItems:[],itemEdits:[]}),/Only active drafts/);
});
test('B06: missing document item, duplicate edits and invalid item amounts abort',()=>{
 const v=vault();
 const proposal=(itemEdits)=>({documentId:'draft-a',addItems:[],itemEdits});
 assert.throws(()=>assertAiDocumentUpdateApproval(v,proposal([{itemId:'missing',quantity:'1'}])),/Missing or duplicated/);
 assert.throws(()=>assertAiDocumentUpdateApproval(v,proposal([{itemId:'line-1',quantity:'1'},{itemId:'line-1',quantity:'2'}])),/Missing or duplicated/);
 assert.throws(()=>assertAiDocumentUpdateApproval(v,proposal([{itemId:'line-1',quantity:'-5'}])),/quantity must be positive/);
 assert.throws(()=>assertAiDocumentUpdateApproval(v,proposal([{itemId:'line-1',unitPrice:'-3'}])),/selling price cannot be negative/);
});
test('B06: document create/update must validate inside the actual vault mutation',async()=>{
 const owner=await readFile('src/components/AiCopilot.tsx','utf8');
 assert.match(owner,/mutateVaultSafely\(vault=>\{assertAiDocumentCreateApproval\(vault,proposal\)/);
 assert.match(owner,/mutateVaultSafely\(vault=>\{assertAiDocumentUpdateApproval\(vault,proposal\)/);
 assert.match(owner,/nextDocumentNumber\(vault,proposal.kind\)/);
});
