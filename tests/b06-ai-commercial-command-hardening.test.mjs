import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {reviseAiPendingDocumentDraft} from '../dist/src/lib/ai-document-conversation.js';
import {reviewAiDocumentProposal} from '../dist/src/lib/ai-document-review.js';
import {assertAiDocumentCreateApproval,assertAiDocumentUpdateApproval} from '../dist/src/lib/ai-document-approval-guard.js';

const refs={
 customers:[{id:'buyer',name:'International Buyer LLC',preferredCurrency:'USD'}],
 items:[{id:'c1',sku:'SN-50',name:'Snacks 50g',descriptionEn:'Snacks 50g',lastCurrency:'USD',lastUnitPrice:'12.50',unit:'CTN'}],
 defaults:{currency:'USD',language:'en'},activeDocument:null
};
const base=()=>({
 capability:'document.createDraft',kind:'proforma',customerId:'buyer',customerDraft:null,
 currency:'USD',language:'en',items:[{savedItemId:'c1',descriptionEn:'Snacks 50g',descriptionAr:'',quantity:'2',unit:'CTN',unitPrice:'12.50'},{savedItemId:'',descriptionEn:'Tea',descriptionAr:'',quantity:'3',unit:'CTN',unitPrice:'4.00'}],
 incoterm:'FOB',paymentTerms:'Cash',deliveryTime:'',validity:'',remarks:'',notes:'',label:'',rationale:''
});
function sourceVault(){
 const v=emptyVault();
 v.customers=[{id:'buyer',workspaceId:'default',companyNameEn:'International Buyer LLC',companyNameAr:'',email:''}];
 v.savedItems=[{id:'c1',workspaceId:'default',sku:'SN-50',descriptionEn:'Snacks 50g',descriptionAr:'',lastCurrency:'USD',lastUnitPrice:'12.50',archived:false}];
 v.documents=[{id:'doc',workspaceId:'default',status:'draft',lifecycleStatus:'active',currency:'USD',items:[{id:'line-1',quantity:'2',unitPrice:'12.50'}]}];
 return v;
}
test('B06 closeout: SKU-targeted sale price and Arabic row quantity change retain exact line state',()=>{
 const one=reviseAiPendingDocumentDraft(base(),'غيّر سعر SKU SN-50 إلى 13.25',refs,'ar');
 assert.ok(one?.changed);assert.equal(one.proposal.items[0].unitPrice,'13.25');
 const two=reviseAiPendingDocumentDraft(one.proposal,'غير كمية الصنف رقم ٢ إلى 10',refs,'ar');
 assert.ok(two?.changed);assert.equal(two.proposal.items[1].quantity,'10');
 assert.deepEqual(reviewAiDocumentProposal(two.proposal,refs,'en').blockers,[]);
 assert.match(reviewAiDocumentProposal(two.proposal,refs,'en').text,/Item subtotal: 66.50 USD/);
});
test('B06 closeout: duplicated SKU in the same quotation must use exact row index',()=>{
 const source=base();source.items.push({...source.items[0]});
 const r=reviseAiPendingDocumentDraft(source,'change price SKU SN-50 to 20',refs,'en');
 assert.equal(r?.changed,false);assert.deepEqual(r.proposal,source);
});
test('B06 closeout: unrecognized SKU or foreign currency leaves stage unchanged',()=>{
 const source=base();
 for(const text of ['غير سعر SKU UNKNOWN إلى 9','change price SKU SN-50 to 5 EUR']){
  const r=reviseAiPendingDocumentDraft(source,text,refs,'en');assert.equal(r?.changed,false);assert.deepEqual(r.proposal,source);
 }
});
test('B06 closeout: composite commands apply atomically and subtotal follows all edits',()=>{
 const source=base();
 const r=reviseAiPendingDocumentDraft(source,'change item 2 price to 8 and then set payment terms to Net 30 and then set incoterm to CIF',refs,'en');
 assert.ok(r?.changed);assert.equal(r.proposal.items[1].unitPrice,'8');
 assert.equal(r.proposal.paymentTerms,'Net 30');assert.equal(r.proposal.incoterm,'CIF');
 assert.equal(source.items[1].unitPrice,'4.00');
 assert.match(reviewAiDocumentProposal(r.proposal,refs,'en').text,/Item subtotal: 49.00 USD/);
 assert.doesNotThrow(()=>assertAiDocumentCreateApproval(sourceVault(),r.proposal));
});
test('B06 closeout: failed step rolls back preceding valid steps in composite request',()=>{
 const source=base();
 const r=reviseAiPendingDocumentDraft(source,'change item 2 price to 8 and then change item 40 quantity to 10',refs,'en');
 assert.ok(r);assert.equal(r.changed,false);assert.deepEqual(r.proposal,source);
 assert.match(r.message,/cancelled/i);
});
test('B06 closeout: unsupported composite step never silently applies part of a quote',()=>{
 const source=base();
 const r=reviseAiPendingDocumentDraft(source,'change item 2 price to 8 and then double all inventory',refs,'en');
 assert.ok(r);assert.equal(r.changed,false);assert.deepEqual(r.proposal,source);
});
test('B06 closeout: terms include incoterm, shipping, validity and remarks',()=>{
 let proposal=base();
 for(const [message,key,value] of [
  ['set delivery time to 14 days','deliveryTime','14 days'],
  ['set validity to 30 days','validity','30 days'],
  ['set remarks to CIF Jeddah port','remarks','CIF Jeddah port'],
  ['set notes to Items inspected before loading','notes','Items inspected before loading']
 ]){
  const r=reviseAiPendingDocumentDraft(proposal,message,refs,'en');assert.ok(r?.changed,message);proposal=r.proposal;
  assert.equal(proposal[key],value);
 }
 const preview=reviewAiDocumentProposal(proposal,refs,'en').text;
 assert.match(preview,/Delivery: 14 days/);assert.match(preview,/Validity: 30 days/);assert.match(preview,/Remarks: CIF Jeddah port/);
});
test('B06 closeout: existing-document update supports only permitted trade terms and text notes',()=>{
 const drafting={...refs,activeDocument:{id:'doc',status:'draft',currency:'USD',items:[{id:'line-1'}]}};
 const proposal={capability:'document.updateDraft',documentId:'doc',addItems:[],itemEdits:[],termsPatch:{},label:'',rationale:''};
 const r=reviseAiPendingDocumentDraft(proposal,'set final destination to Riyadh and then set port of loading to Istanbul',drafting,'en');
 assert.ok(r?.changed);assert.equal(r.proposal.termsPatch.finalDestination,'Riyadh');
 assert.equal(r.proposal.termsPatch.portOfLoading,'Istanbul');
 assert.doesNotThrow(()=>assertAiDocumentUpdateApproval(sourceVault(),r.proposal));
});
test('B06 closeout: new commercial document cannot be saved without a customer',()=>{
 assert.throws(()=>assertAiDocumentCreateApproval(sourceVault(),{...base(),customerId:'',customerDraft:null}),/requires an existing/);
 assert.throws(()=>assertAiDocumentCreateApproval(sourceVault(),{...base(),customerDraft:{companyNameEn:'Extra customer'}}),/ambiguous/);
});
test('B06 closeout: atomic approval rejects unknown, oversized or non-string commercial changes',()=>{
 const proposal={documentId:'doc',addItems:[],itemEdits:[]};
 for(const termsPatch of [{unknown:'ignored'},{paymentTerms:'x'.repeat(121)},{incoterm:23},{__secret:'bad'}]){
  assert.throws(()=>assertAiDocumentUpdateApproval(sourceVault(),{...proposal,termsPatch}),/commercial term/i);
 }
 assert.throws(()=>assertAiDocumentUpdateApproval(sourceVault(),{...proposal,notes:{evil:true}}),/notes/);
 assert.throws(()=>assertAiDocumentUpdateApproval(sourceVault(),{...proposal,language:'wrong'}),/language/);
 assert.throws(()=>assertAiDocumentUpdateApproval(sourceVault(),{...proposal,itemEdits:[{itemId:'line-1',descriptionEn:'x'.repeat(170)}]}),/edited document item/);
});
test('B06 closeout: pending quote preview and blockers survive tool-planner failures and unrelated answers',async()=>{
 const owner=await readFile('src/components/AiCopilot.tsx','utf8');
 assert.match(owner,/const pendingDocumentReview=pendingDocumentProposal\?this.state.review:null/);
 assert.match(owner,/review:proposal\?review:pendingDocumentReview/);
 assert.match(owner,/proposal:pendingDocumentProposal,review:pendingDocumentReview/);
 assert.match(owner,/proposal:pendingDocumentProposal,review:pendingDocumentReview,messages:/);
});
test('B06 closeout: 15-line sales quotation remains reviewable and guarded as one complete plan',()=>{
 const proposal={...base(),items:Array.from({length:15},(_,i)=>({savedItemId:'',descriptionEn:'Product '+(i+1),descriptionAr:'',quantity:'2',unit:'CTN',unitPrice:'3.50'}))};
 const review=reviewAiDocumentProposal(proposal,refs,'en');
 assert.deepEqual(review.blockers,[]);assert.match(review.text,/Product 15/);
 assert.match(review.text,/Item subtotal: 105.00 USD/);
 assert.doesNotThrow(()=>assertAiDocumentCreateApproval(sourceVault(),proposal));
});
