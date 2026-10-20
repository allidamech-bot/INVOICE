import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {normalizePaymentRecord} from '../dist/src/lib/payments.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase} from '../dist/src/lib/operations.js';
import {createSupplierPayment,normalizeSupplierPayment} from '../dist/src/lib/payables.js';
import {createTreasuryAccount,createTreasuryEntry,appendTreasuryEntry,createTreasuryReconciliation,treasuryAccountBalance,treasuryProjection,voidTreasuryEntry,markTreasuryEntryReconciled} from '../dist/src/lib/treasury-ledger.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
const reopen=value=>JSON.parse(JSON.stringify(value));

test('saved treasury collection, supplier payment, transfer, reconciliation and remote void balance exactly',()=>{
  let vault=emptyVault();
  const invoice=createBlankDocument('invoice','INV-QA-TREASURY',vault.company);
  Object.assign(invoice,{id:'qa-treasury-invoice',status:'final',currency:'USD',
    workspaceId:'default',branchId:'main',customerSnapshot:{sourceCustomerId:'qa-treasury-buyer',
      companyNameEn:'Synthetic buyer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',
      city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''}});
  invoice.items=[{...invoice.items[0],descriptionEn:'Synthetic service',quantity:'1',unitPrice:'100.00',stockTreatment:'non-stock'}];
  invoice.adjustments={...invoice.adjustments,discountEnabled:false,taxEnabled:false,shippingEnabled:false,otherChargesEnabled:false};
  const receipt=normalizePaymentRecord(invoice,[],{id:'qa-treasury-receipt',amount:'100.00',
    date:invoice.issueDate,method:'bank-transfer',reference:'QA-C100',notes:''},[invoice]);
  const supplier={...createSupplier(),id:'qa-treasury-supplier',nameEn:'Synthetic supplier'};
  const item={id:'qa-treasury-item',sku:'QA-TREASURY',descriptionEn:'Synthetic goods',descriptionAr:'',
    unit:'PCS',lastUnitCost:'5.00',lastCostCurrency:'USD'};
  const draft=createPurchase([],[supplier],'USD');
  Object.assign(draft,{id:'qa-treasury-purchase',number:'PUR-QA-TREASURY',freight:'0.00',duty:'0.00',otherCosts:'0.00'});
  draft.items=[{...createPurchaseItem(item),quantity:'10',unitCost:'5.00'}];
  const posted=postPurchase(draft,[item],[]);
  const supplierPayment=normalizeSupplierPayment(posted.purchase,supplier,[],{
    ...createSupplierPayment(posted.purchase,supplier,[]),id:'qa-treasury-supplier-payment',amount:'50.00'});
  vault={...vault,documents:[invoice],payments:[receipt],suppliers:[supplier],purchases:[posted.purchase],
    supplierPayments:[supplierPayment],savedItems:posted.savedItems,inventoryMovements:posted.movements};
  const scope={workspaceId:'default',branchId:'main'};
  const bank={...createTreasuryAccount({...scope,label:'Synthetic bank',kind:'bank',currency:'USD',bankAccountId:'primary'}),id:'qa-cycle-bank'};
  const cash={...createTreasuryAccount({...scope,label:'Synthetic cash',kind:'cash',currency:'USD'}),id:'qa-cycle-cash'};
  const save=next=>{vault=reopen(mergeVaultIntent(vault,next,vault));};
  save({...vault,treasuryAccounts:[bank,cash]});
  const entry=(type,id,amount,fields)=>({...createTreasuryEntry(type,'USD'),...scope,id,amount,...fields});
  const opening=entry('opening-balance','qa-cycle-opening','1000.00',{toAccountId:bank.id});
  const collection=entry('collection','qa-cycle-collection','100.00',{
    toAccountId:bank.id,sourceType:'customer-payment',sourceId:receipt.id});
  const payment=entry('supplier-payment','qa-cycle-payment','50.00',{
    fromAccountId:bank.id,sourceType:'supplier-payment',sourceId:supplierPayment.id});
  const transfer=entry('transfer','qa-cycle-transfer','200.00',{fromAccountId:bank.id,toAccountId:cash.id});
  for(const movement of [opening,collection,payment,transfer])save(appendTreasuryEntry(vault,movement));
  const balance=id=>treasuryAccountBalance(id,vault.treasuryEntries);
  const projection=()=>treasuryProjection(vault.payments,vault.supplierPayments,vault.expenses,
    vault.treasuryEntries,vault.treasuryReconciliations);
  assert.equal(balance(bank.id),'850.00');assert.equal(balance(cash.id),'200.00');
  assert.equal(projection().length,4,'canonical payments allocated to accounts must not count twice');
  const before=JSON.stringify(vault);
  assert.throws(()=>appendTreasuryEntry(vault,{...collection,id:'qa-duplicate-collection'}),/already allocated|already linked/i);
  assert.throws(()=>mergeVaultIntent(vault,{...vault,treasuryAccounts:[cash]},vault),/cannot be deleted.*history/i);
  const duplicate={...cash,id:'qa-duplicate-new-account'};
  assert.throws(()=>mergeVaultIntent(vault,{...vault,treasuryAccounts:[...vault.treasuryAccounts,duplicate,{...duplicate}]},vault),/duplicate|unique/i);
  const foreign={...createTreasuryEntry('deposit','USD'),...scope,id:'qa-foreign-deposit',
    amount:'1.00',toAccountId:bank.id,branchId:'foreign-branch'};
  assert.throws(()=>appendTreasuryEntry(vault,foreign),/Workspace changed/i);
  assert.throws(()=>mergeVaultIntent(vault,{...vault,treasuryEntries:[...vault.treasuryEntries,foreign]},vault),/scope|branch|account/i);
  assert.equal(JSON.stringify(vault),before);
  const reconciliation={...createTreasuryReconciliation('treasury:'+transfer.id,'Synthetic bank match'),
    ...scope,id:'qa-cycle-reconciliation'};
  save({...vault,treasuryReconciliations:[reconciliation]});
  assert.equal(projection().find(row=>row.key==='treasury:'+transfer.id).reconciled,true);
  assert.equal(balance(bank.id),'850.00');assert.equal(balance(cash.id),'200.00');
  const beforeVoid=reopen(vault),voided=voidTreasuryEntry(vault.treasuryEntries.find(row=>row.id===transfer.id),'Synthetic bank transfer correction');
  const remote={...beforeVoid,treasuryEntries:beforeVoid.treasuryEntries.map(row=>row.id===transfer.id?voided:row)};
  const unrelated={...beforeVoid,appSettings:{...beforeVoid.appSettings,uiLanguage:'ar'}};
  vault=reopen(mergeVaultIntent(beforeVoid,unrelated,reopen(remote)));
  assert.equal(balance(bank.id),'1050.00');assert.equal(balance(cash.id),'0.00');
  assert.equal(vault.treasuryEntries.length,4);assert.equal(vault.treasuryReconciliations.length,1);
  assert.deepEqual(vault.treasuryReconciliations[0],reconciliation);
  assert.equal(projection().some(row=>row.key==='treasury:'+transfer.id),false);
  assert.equal(projection().length,3);
  assert.equal(vault.treasuryAccounts.find(row=>row.id===bank.id).bankAccountId,'primary');
  assert.deepEqual(vault.payments,[receipt]);assert.deepEqual(vault.supplierPayments,[supplierPayment]);
  assert.throws(()=>markTreasuryEntryReconciled(voided,true),/voided/i);
  const after=JSON.stringify(vault);
  vault=reopen(mergeVaultIntent(vault,reopen(vault),reopen(vault)));
  assert.equal(JSON.stringify(vault),after,'replay must not resurrect the voided transfer');
});
