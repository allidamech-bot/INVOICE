import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem} from '../dist/src/lib/operations.js';
import {todayIso} from '../dist/src/lib/id.js';
import {purchasePayableSummary,assertSupplierPaymentInvariant} from '../dist/src/lib/payables.js';
import {isAiSupplierSettlementIntent,parseAiSupplierSettlement,prepareAiSupplierSettlement,applyAiSupplierSettlement} from '../dist/src/lib/ai-operational-supplier-settlement.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {prepareFoundationApproval,assertFoundationApproval,foundationActionAllowed} from '../dist/src/lib/ai-foundation-approval.js';

function fixture(){
 const vault=emptyVault(),supplier={...createSupplier(),nameEn:'FMCG Supplier',nameAr:'مورد مواد غذائية',defaultCurrency:'USD'};
 vault.suppliers=[supplier];
 const purchase=createPurchase([],vault.suppliers);
 purchase.status='posted';purchase.postedAt=new Date().toISOString();purchase.currency='USD';purchase.date=todayIso();purchase.dueDate=todayIso();
 purchase.items=[{...createPurchaseItem(),descriptionEn:'Red Bull',descriptionAr:'ريد بول',unit:'Carton',quantity:'10',unitCost:'25'}];
 vault.purchases=[purchase];
 return{vault,purchase,supplier};
}
function command(number,amount='90',ref='BANK-PAY-321',currency='USD',date=todayIso()){
 return 'سجّل دفعة مورد '+number+'، المبلغ '+amount+' '+currency+
  '، التاريخ '+date+'، الطريقة bank-transfer، المرجع '+ref;
}
const ctx=mode=>({conversationMode:mode,assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
test('Supplier payment parser accepts exact AR/EN and no second instruction',()=>{
 const f=fixture(),text=command(f.purchase.number);
 assert.equal(isAiSupplierSettlementIntent(text),true);
 assert.deepEqual(parseAiSupplierSettlement(text),{
  purchaseNumber:f.purchase.number,amount:'90',currency:'USD',
  date:todayIso(),method:'bank-transfer',reference:'BANK-PAY-321'
 });
 const en='record supplier payment '+f.purchase.number+', amount 90 USD, date '+todayIso()+', method cash, reference CASH-123';
 assert.equal(parseAiSupplierSettlement(en).method,'cash');
 for(const message of [
  'سجّل دفعة مورد '+f.purchase.number,
  command(f.purchase.number)+' واعتمدها',
  command(f.purchase.number)+' ثم احذف سجل المورد',
  command(f.purchase.number,'90','REF-TEST','EUR')+' and convert USD',
 ]){
  assert.equal(parseAiSupplierSettlement(message),null,'invalid/compound payment must never match: '+message);
 }
 assert.equal(isAiSupplierSettlementIntent('افتح فاتورة المورد'),false);
});
test('Controller prepares real posted-purchase payable payment; advisor never stages cash',async()=>{
 const f=fixture(),before=structuredClone(f.vault),message=command(f.purchase.number);
 const controller=await orchestrateAiToolRequest({message,vault:f.vault,context:ctx('controller'),language:'ar'});
 assert.equal(controller?.plannedBy,'local');
 assert.equal(controller?.proposal?.tool,'procurement.recordSupplierPayment');
 assert.equal(controller?.proposal?.args?.purchaseId,f.purchase.id);
 assert.equal(controller?.proposal?.args?.beforeRemaining,'250.00');
 assert.equal(controller?.proposal?.args?.afterRemaining,'160.00');
 assert.match(controller?.proposal?.preview.join('\n'),/Remaining before: 250\.00/);
 assert.deepEqual(f.vault,before);
 const advisor=await orchestrateAiToolRequest({message,vault:f.vault,context:ctx('advisor'),language:'ar'});
 assert.notEqual(advisor?.proposal?.tool,'procurement.recordSupplierPayment');
 assert.deepEqual(f.vault,before);
});
test('Supplier approved payment posts exact amount and never mutates stock, purchase, GRN or invoice',()=>{
 const {vault,purchase}=fixture(),before=structuredClone(vault);
 const request=parseAiSupplierSettlement(command(purchase.number));
 const review=prepareAiSupplierSettlement(vault,request);
 assert.equal(review.afterRemaining,'160.00');
 const applied=applyAiSupplierSettlement(vault,review);
 assert.equal(applied.payment.amount,'90.00');
 assert.equal(applied.payment.reference,'BANK-PAY-321');
 assert.equal(purchasePayableSummary(purchase,applied.vault.supplierPayments).remaining,'160.00');
 for(const p of ['documents','documentEvents','inventoryMovements','purchases','payments','savedItems','treasuryEntries'])
  assert.deepEqual(applied.vault[p],before[p],p+' not modified');
 assert.equal(applied.vault.supplierPayments.length,1);
 assert.deepEqual(vault,before,'input vault remains immutable');
 assert.doesNotThrow(()=>assertSupplierPaymentInvariant(applied.vault.purchases,applied.vault.suppliers,applied.vault.supplierPayments));
 assert.throws(()=>applyAiSupplierSettlement(applied.vault,review),/duplicate|already has a payment/);
});
test('Supplier payment rejects a draft, missing supplier, insufficient balance, wrong FX and reused bank reference',()=>{
 const f=fixture(),noPosting={...f.vault,purchases:[{...f.purchase,status:'draft'}]};
 assert.throws(()=>prepareAiSupplierSettlement(noPosting,parseAiSupplierSettlement(command(f.purchase.number))),/POSTED/);
 assert.throws(()=>prepareAiSupplierSettlement(f.vault,parseAiSupplierSettlement(command(f.purchase.number,'300'))),/exceed/);
 assert.throws(()=>prepareAiSupplierSettlement(f.vault,parseAiSupplierSettlement(command(f.purchase.number,'50','BANK-333','EUR'))),/currency/);
 const noSupplier={...f.vault,suppliers:[]};
 assert.throws(()=>prepareAiSupplierSettlement(noSupplier,parseAiSupplierSettlement(command(f.purchase.number))),/supplier/i);
 const payment=applyAiSupplierSettlement(f.vault,prepareAiSupplierSettlement(f.vault,parseAiSupplierSettlement(command(f.purchase.number)))).vault.supplierPayments[0];
 const second={...f.vault,supplierPayments:[{...payment,purchaseId:f.purchase.id}]};
 assert.throws(()=>prepareAiSupplierSettlement(second,parseAiSupplierSettlement(command(f.purchase.number,'10'))),/same external reference/);
});
test('Supplier payment invalidates stale review after another payment, purchase edit, branch or actor change',()=>{
 const f=fixture(),review=prepareAiSupplierSettlement(f.vault,parseAiSupplierSettlement(command(f.purchase.number)));
 const others=prepareAiSupplierSettlement(f.vault,parseAiSupplierSettlement(command(f.purchase.number,'20','BANK-OTHER-111')));
 const concurrent=applyAiSupplierSettlement(f.vault,others).vault;
 assert.throws(()=>applyAiSupplierSettlement(concurrent,review),/changed/i);
 const edited={...f.vault,purchases:[{...f.purchase,items:[{...f.purchase.items[0],unitCost:'26'}]}]};
 assert.throws(()=>applyAiSupplierSettlement(edited,review),/changed/i);
 const branch={...f.vault,appSettings:{...f.vault.appSettings,activeBranchId:'separate'}};
 assert.throws(()=>applyAiSupplierSettlement(branch,review),/branch/i);
 const actor={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role:'viewer'}]};
 assert.throws(()=>applyAiSupplierSettlement(actor,review),/permission/);
});
test('Finance / owner can approve exact payment, purchasing/sales/viewer cannot; approval tamper rejected',async()=>{
 const f=fixture(),review=prepareAiSupplierSettlement(f.vault,parseAiSupplierSettlement(command(f.purchase.number)));
 const proposal={capability:'tool.execute',tool:'procurement.recordSupplierPayment',
   args:review,label:'Supplier settlement',rationale:'Cash against a posted purchase'};
 const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'supplier-pay-test'};
 for(const role of ['owner','finance','admin']){
  const vault={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role}]};
  assert.equal(foundationActionAllowed(vault,proposal,scope),true,role);
  const signed={...proposal,foundationApproval:prepareFoundationApproval(vault,proposal,scope)};
  assert.doesNotThrow(()=>assertFoundationApproval(vault,signed));
  assert.throws(()=>assertFoundationApproval(vault,{...signed,args:{...review,amount:'999.00'}}),/payload changed/);
 }
 for(const role of ['sales','purchasing','viewer']){
  const vault={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role}]};
  assert.equal(foundationActionAllowed(vault,proposal,scope),false,role);
 }
 const actions=await readFile(new URL('../src/lib/ai-tool-actions.ts',import.meta.url),'utf8');
 assert.match(actions,/separately signed finance approval is required/);
 assert.match(actions,/applyAiSupplierSettlement\(vault,review\)/);
});
