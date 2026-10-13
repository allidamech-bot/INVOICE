import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument,validateDocument} from '../dist/src/lib/documents.js';
import {invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {todayIso} from '../dist/src/lib/id.js';
import {prepareFoundationApproval,assertFoundationApproval,foundationActionAllowed} from '../dist/src/lib/ai-foundation-approval.js';
import {isAiCustomerCollectionIntent,parseAiCustomerCollection,prepareAiCustomerCollection,applyAiCustomerCollection} from '../dist/src/lib/ai-operational-customer-collection.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
const number='INV-2026-0049',command=(amount='100',currency='USD',reference='BANK-100')=>
 'سجّل تحصيل فاتورة '+number+'، المبلغ '+amount+' '+currency+'، التاريخ '+todayIso()+'، الطريقة bank-transfer، المرجع '+reference;
function fixture(){
 const vault=emptyVault(),time=new Date().toISOString();
 const customer={id:'buyer-49',companyNameEn:'Riyadh Buyer',companyNameAr:'مشتري الرياض',
  contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',
  vatTaxNumber:'',commercialRegistration:'',createdAt:time,updatedAt:time};
 vault.customers=[customer];
 const invoice=createBlankDocument('invoice',number,vault.company);
 invoice.status='final';invoice.issueDate=todayIso();
 invoice.customerSnapshot=customerSnapshotFrom(customer);invoice.currency='USD';
 invoice.items=[{...invoice.items[0],id:'line-a',descriptionEn:'Product A',descriptionAr:'المنتج أ',
  quantity:'2',unitPrice:'100',unit:'Carton'}];
 assert.deepEqual(validateDocument(invoice),{});
 vault.documents=[invoice];
 return{vault,invoice};
}
const context=mode=>({conversationMode:mode,assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
test('Collections accept only one explicit complete invoice amount/currency/date/method/reference',()=>{
 for(const msg of [command(),
  'Record invoice collection '+number+'; amount 100 USD; date '+todayIso()+'; method bank-transfer; reference BANK-100',
  'سجّل تحصيل فاتورة INV-٢٠٢٦-٠٠٤٩، المبلغ ١٠٠ USD، التاريخ '+todayIso()+'، الطريقة cash، المرجع CASH-100']){
   assert.equal(isAiCustomerCollectionIntent(msg),true);
   assert.equal(parseAiCustomerCollection(msg).invoiceNumber,number);
 }
 for(const msg of ['اعرض فاتورة '+number,
  'سجّل تحصيل فاتورة '+number,'سجّل تحصيل فاتورة '+number+'، المبلغ 100 USD',
  command()+' ثم احذف الفاتورة',
  command().replace('USD','EUR')+' واعتمد التحصيل']){
  assert.equal(parseAiCustomerCollection(msg),null,msg);
 }
 assert.throws(()=>parseAiCustomerCollection(command().replace(todayIso(),'2099-01-01')),/non-future/);
});
test('Controller prepares signed review only; Advisor and model cannot stage payment',async()=>{
 const f=fixture(),before=structuredClone(f.vault);
 const result=await orchestrateAiToolRequest({message:command(),vault:f.vault,context:context('controller'),language:'ar'});
 assert.equal(result.plannedBy,'local');
 assert.equal(result.proposal?.tool,'sales.recordCustomerCollection');
 assert.equal(result.proposal?.capability,'tool.execute');
 assert.equal(result.proposal?.args?.amount,'100.00');
 assert.match(result.proposal.preview.join('\\n'),/Remaining BEFORE: 200\.00 \| AFTER: 100\.00/);
 assert.equal(result.proposal?.args?.reference,'BANK-100');
 const advisor=await orchestrateAiToolRequest({message:command(),vault:f.vault,context:context('advisor'),language:'ar'});
 assert.notEqual(advisor?.proposal?.tool,'sales.recordCustomerCollection');
 assert.deepEqual(f.vault,before);
});
test('Approved payment reduces receivables only, preserves invoice and stock, refuses duplicate external reference',()=>{
 const f=fixture(),before=structuredClone(f.vault);
 const review=prepareAiCustomerCollection(f.vault,parseAiCustomerCollection(command()));
 assert.equal(review.beforeRemaining,'200.00');
 assert.equal(review.afterRemaining,'100.00');
 const result=applyAiCustomerCollection(f.vault,review);
 assert.equal(result.payment.amount,'100.00');
 assert.equal(result.payment.reference,'BANK-100');
 assert.equal(result.vault.payments.length,1);
 assert.equal(invoicePaymentSummary(f.invoice,result.vault.payments,todayIso(),result.vault.documents).remaining,'100.00');
 for(const key of ['documents','inventoryMovements','purchases','supplierPayments','savedItems','treasuryEntries'])
  assert.deepEqual(result.vault[key],before[key],key+' should not be touched by payment ledger');
 assert.deepEqual(f.vault,before);
 assert.throws(()=>prepareAiCustomerCollection(result.vault,parseAiCustomerCollection(command())),/already exists/);
 assert.throws(()=>applyAiCustomerCollection(result.vault,review),/already exists|changed/);
 const second=prepareAiCustomerCollection(result.vault,parseAiCustomerCollection(command('100','USD','BANK-101')));
 const paid=applyAiCustomerCollection(result.vault,second);
 assert.equal(invoicePaymentSummary(f.invoice,paid.vault.payments,todayIso(),paid.vault.documents).remaining,'0.00');
 assert.throws(()=>prepareAiCustomerCollection(paid.vault,parseAiCustomerCollection(command('1','USD','BANK-102'))),/remaining invoice balance/);
});
test('Reject wrong currency, over-collection, cancelled invoice and stale settlements',()=>{
 const f=fixture();
 assert.throws(()=>prepareAiCustomerCollection(f.vault,parseAiCustomerCollection(command('50','EUR'))),/currency/);
 assert.throws(()=>prepareAiCustomerCollection(f.vault,parseAiCustomerCollection(command('201'))),/remaining invoice balance/);
 const draft={...f.vault,documents:[{...f.invoice,status:'draft'}]};
 assert.throws(()=>prepareAiCustomerCollection(draft,parseAiCustomerCollection(command())),/issued invoice/);
 const review=prepareAiCustomerCollection(f.vault,parseAiCustomerCollection(command()));
 const changed={...f.vault,payments:[{...applyAiCustomerCollection(f.vault,review).payment,
   id:'different',reference:'BANK-999',amount:'50.00'}]};
 assert.throws(()=>applyAiCustomerCollection(changed,review),/changed/);
 const branch={...f.vault,appSettings:{...f.vault.appSettings,activeBranchId:'other'}};
 assert.throws(()=>applyAiCustomerCollection(branch,review),/branch changed/);
 const viewer={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role:'viewer'}]};
 assert.throws(()=>applyAiCustomerCollection(viewer,review),/permission/);
});
test('Signed collection requires Finance/owner/admin role and cannot be replayed with altered amount',async()=>{
 const f=fixture(),review=prepareAiCustomerCollection(f.vault,parseAiCustomerCollection(command()));
 const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'collection-test'};
 const proposal={capability:'tool.execute',tool:'sales.recordCustomerCollection',args:review,label:'Collection',rationale:'Exact customer payment'};
 for(const role of ['owner','admin','finance']){
  const v={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role}]};
  assert.equal(foundationActionAllowed(v,proposal,scope),true);
  const signed={...proposal,foundationApproval:prepareFoundationApproval(v,proposal,scope)};
  assert.doesNotThrow(()=>assertFoundationApproval(v,signed));
  assert.throws(()=>assertFoundationApproval(v,{...signed,args:{...review,amount:'199.00'}}),/payload changed/);
 }
 for(const role of ['sales','purchasing','viewer']){
  const v={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role}]};
  assert.equal(foundationActionAllowed(v,proposal,scope),false);
 }
 const source=await readFile(new URL('../src/lib/ai-tool-actions.ts',import.meta.url),'utf8');
 assert.match(source,/An independent signed customer collection approval is required/);
 assert.match(source,/applyAiCustomerCollection\(vault,review\)/);
 assert.match(source,/assertFoundationApproval\(vault,proposal\)/);
});
