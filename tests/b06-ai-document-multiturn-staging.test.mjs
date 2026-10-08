import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reviseAiPendingDocumentDraft} from '../dist/src/lib/ai-document-conversation.js';
import {reviewAiDocumentProposal} from '../dist/src/lib/ai-document-review.js';

const context={
  customers:[{id:'customer-a',name:'Buyer Co',preferredCurrency:'USD',paymentTerms:''}],
  items:[{id:'product-a',name:'Biscuits 50g',sku:'B50',unit:'carton',descriptionEn:'Biscuits 50g',descriptionAr:'',lastUnitPrice:'12.50',lastCurrency:'USD'}],
  defaults:{currency:'USD',language:'en',incoterm:'FOB',paymentTerms:'',deliveryTime:'',validity:''},
  activeDocument:null
};
function create(){return{
  capability:'document.createDraft',kind:'proforma',customerId:'customer-a',customerDraft:null,currency:'USD',language:'en',
  items:[{savedItemId:'product-a',descriptionEn:'Biscuits 50g',descriptionAr:'',quantity:'2',unit:'carton',unitPrice:'12.50'},{savedItemId:'',descriptionEn:'Nuts',descriptionAr:'',quantity:'3',unit:'box',unitPrice:'9.00'}],
  incoterm:'FOB',paymentTerms:'Cash',deliveryTime:'',validity:'',remarks:'',notes:'',label:'',rationale:''
};}
test('B06: follow-up quantity and price changes keep all previous draft rows and recalculate subtotal',()=>{
 const first=reviseAiPendingDocumentDraft(create(),'غيّر كمية الصنف رقم 1 إلى 10',context,'ar');
 assert.equal(first.changed,true);assert.equal(first.proposal.items[0].quantity,'10');assert.equal(first.proposal.items.length,2);
 const second=reviseAiPendingDocumentDraft(first.proposal,'change item 2 price to 8.25',context,'en');
 assert.equal(second.changed,true);assert.equal(second.proposal.items[0].quantity,'10');assert.equal(second.proposal.items[1].unitPrice,'8.25');
 const review=reviewAiDocumentProposal(second.proposal,context,'en');
 assert.deepEqual(review.blockers,[]);assert.match(review.text,/Item subtotal: 149\.75 USD/);
});
test('B06: Arabic digits, unit terms and explicit new items stay in one unsaved proposal',()=>{
 const a=reviseAiPendingDocumentDraft(create(),'أضف صنف: شوكولاتة 50 غرام؛ الكمية: ١٠؛ السعر: ٣.٥٠؛ الوحدة: كرتون',context,'ar');
 assert.equal(a.changed,true);assert.equal(a.proposal.items.length,3);
 assert.equal(a.proposal.items[2].quantity,'10');assert.equal(a.proposal.items[2].unitPrice,'3.50');
 assert.equal(a.proposal.items[2].descriptionEn,'شوكولاتة 50 غرام');
 const b=reviseAiPendingDocumentDraft(a.proposal,'set payment terms to Net 30',context,'en');
 assert.equal(b.proposal.paymentTerms,'Net 30');
 const c=reviseAiPendingDocumentDraft(b.proposal,'delete item 2',context,'en');
 assert.equal(c.proposal.items.length,2);assert.equal(c.proposal.items[1].descriptionEn,'شوكولاتة 50 غرام');
});
test('B06: reject negative, zero, unsupported cross-currency or out-of-range revisions without mutation',()=>{
 const original=create();
 for(const prompt of ['change item 1 quantity to 0','change item 2 price to -5','change item 2 price to 4 EUR','change item 9 price to 3']){
   const result=reviseAiPendingDocumentDraft(original,prompt,context,'en');
   assert.ok(result);assert.equal(result.changed,false);assert.deepEqual(result.proposal,original);
 }
 assert.equal(original.items[0].quantity,'2');
});
test('B06: missing new item fields and overly long additions never become partial rows',()=>{
 const original=create();
 for(const prompt of ['add item: Chips; quantity: 10','add item: Chocolate; quantity: 10; price: -1']){
  const result=reviseAiPendingDocumentDraft(original,prompt,context,'en');
  assert.equal(result.changed,false);assert.deepEqual(result.proposal,original);
 }
});
test('B06: 20-line staging limit is enforced without silent truncation',()=>{
 const input={...create(),items:Array.from({length:20},(_,i)=>({savedItemId:'',descriptionEn:'Product '+i,descriptionAr:'',quantity:'1',unit:'box',unitPrice:'2'}))};
 const result=reviseAiPendingDocumentDraft(input,'add item: Extra; quantity: 2; price: 5',context,'en');
 assert.equal(result.changed,false);assert.equal(result.proposal.items.length,20);
});
test('B06: chat approval never performs saving, it reminds user to click explicitly',()=>{
 const r=reviseAiPendingDocumentDraft(create(),'اعتمد',context,'ar');
 assert.equal(r.changed,false);assert.match(r.message,/زر الموافقة/);
});
test('B06: update proposal revisions target exact line identity and retain existing edits',()=>{
 const drafting={...context,activeDocument:{id:'doc1',number:'PI-2026-0001',kind:'proforma',status:'draft',currency:'USD',language:'en',items:[{id:'line-1',descriptionEn:'A',descriptionAr:'',quantity:'1',unit:'CTN',unitPrice:'10'},{id:'line-2',descriptionEn:'B',descriptionAr:'',quantity:'2',unit:'CTN',unitPrice:'11'}],terms:{}}};
 const update={capability:'document.updateDraft',documentId:'doc1',addItems:[],itemEdits:[{itemId:'line-1',quantity:'4'}],termsPatch:{},label:'',rationale:''};
 const stage=reviseAiPendingDocumentDraft(update,'change item 2 price to 19',drafting,'en');
 assert.equal(stage.changed,true);assert.equal(stage.proposal.itemEdits.length,2);
 assert.deepEqual(stage.proposal.itemEdits.find(row=>row.itemId==='line-2'),{itemId:'line-2',unitPrice:'19'});
 const second=reviseAiPendingDocumentDraft(stage.proposal,'change item 1 quantity to 5',drafting,'en');
 assert.equal(second.proposal.itemEdits.length,2);assert.equal(second.proposal.itemEdits.find(row=>row.itemId==='line-1').quantity,'5');
});
test('B06: existing saved lines cannot be deleted through staged update by text',()=>{
 const drafting={...context,activeDocument:{id:'doc1',status:'draft',currency:'USD',items:[{id:'line-1'}]}};
 const update={capability:'document.updateDraft',documentId:'doc1',addItems:[],itemEdits:[],termsPatch:{},label:'',rationale:''};
 const r=reviseAiPendingDocumentDraft(update,'remove item 1',drafting,'en');assert.equal(r.changed,false);
});
test('B06: component preserves pending drafts across valid and unrelated follow-up messages',async()=>{
 const source=await readFile('src/components/AiCopilot.tsx','utf8');
 assert.match(source,/pendingDocumentProposal=this\.state\.proposal/);
 assert.match(source,/reviseAiPendingDocumentDraft\(pendingDocumentProposal,message,context\.drafting,this\.props\.language\)/);
 assert.match(source,/proposal:proposal\?\?pendingDocumentProposal/);
 assert.match(source,/this\.setState\(state=>\(\{busy:false,proposal,review,error:''/);
});
