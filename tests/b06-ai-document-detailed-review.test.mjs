import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reviewAiDocumentProposal} from '../dist/src/lib/ai-document-review.js';

const drafting={
 customers:[{id:'c1',name:'LOUREX Buyer'}],
 items:[{id:'sku1',sku:'F50',name:'Snack 50g',lastCurrency:'USD',lastUnitPrice:'12.50'}],
 defaults:{currency:'USD',language:'en'},
 activeDocument:null
};
const create=(items)=>({capability:'document.createDraft',kind:'proforma',customerId:'c1',customerDraft:null,currency:'USD',language:'en',items,incoterm:'FOB',paymentTerms:'Advance',deliveryTime:'',validity:'',remarks:'',notes:'',label:'',rationale:''});
test('B06 part 3: show every line, registered price fallback and exact item subtotal before approval',()=>{
 const review=reviewAiDocumentProposal(create([
  {savedItemId:'sku1',descriptionEn:'',descriptionAr:'',quantity:'3',unit:'carton',unitPrice:''},
  {savedItemId:'',descriptionEn:'New item',descriptionAr:'',quantity:'2',unit:'case',unitPrice:'5.20'}
 ]),drafting,'en');
 assert.deepEqual(review.blockers,[]);
 assert.match(review.text,/Customer: LOUREX Buyer/);
 assert.match(review.text,/Snack 50g/);
 assert.match(review.text,/3 carton/);
 assert.match(review.text,/12\.50 USD/);
 assert.match(review.text,/New item/);
 assert.match(review.text,/2 case/);
 assert.match(review.text,/Item subtotal: 47\.90 USD/);
 assert.match(review.text,/Subtotal excludes taxes/);
});
test('B06 part 3: incomplete quantities, prices and unlinked customer block approval',()=>{
 const review=reviewAiDocumentProposal({...create([{savedItemId:'',descriptionEn:'Unpriced',descriptionAr:'',quantity:'',unit:'',unitPrice:''}]),customerId:''},drafting,'ar');
 assert.ok(review.blockers.length>=3);
 assert.match(review.text,/بيانات تحتاج إكمالًا/);
});
test('B06 part 3: switching catalog currency removes implicit catalog price',()=>{
 const review=reviewAiDocumentProposal({...create([{savedItemId:'sku1',descriptionEn:'',descriptionAr:'',quantity:'1',unit:'',unitPrice:''}]),currency:'EUR'},drafting,'en');
 assert.match(review.blockers.join(' '),/price/);
});
test('B06 part 3: draft updates display complete after state and item edits',()=>{
 const current={...drafting,activeDocument:{id:'doc1',number:'PI-2026-001',status:'draft',currency:'USD',items:[{id:'line1',descriptionEn:'Snack 50g',descriptionAr:'',quantity:'2',unit:'case',unitPrice:'12.50'}]}};
 const review=reviewAiDocumentProposal({capability:'document.updateDraft',documentId:'doc1',addItems:[{savedItemId:'',descriptionEn:'New product',descriptionAr:'',quantity:'1',unit:'case',unitPrice:'10.00'}],itemEdits:[{itemId:'line1',quantity:'4'}],termsPatch:{paymentTerms:'30 days'},label:'',rationale:''},current,'en');
 assert.deepEqual(review.blockers,[]);
 assert.match(review.text,/Items after change \(2\)/);
 assert.match(review.text,/4 case/);
 assert.match(review.text,/Updated item subtotal: 60\.00 USD/);
 assert.match(review.text,/30 days/);
});
test('B06 part 3: owner uses reviewed payload and disables approve for missing data',async()=>{
 const source=await readFile('src/components/AiCopilot.tsx','utf8');
 assert.match(source,/reviewAiDocumentProposal\(proposal,context\.drafting,this\.props\.language\)/);
 assert.match(source,/disabled=\{this\.state\.busy\|\|Boolean\(this\.state\.review\?\.blockers\.length\)\}/);
 assert.match(source,/vault\.customers\]\.filter\(inWorkspace\)/);
 assert.match(source,/vault\.savedItems\.filter\(item=>inWorkspace\(item\)/);
});
