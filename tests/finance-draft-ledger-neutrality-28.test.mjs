import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase,validatePurchase,inventoryBalances} from '../dist/src/lib/operations.js';
import {receivablesByCurrency} from '../dist/src/lib/receivables.js';
import {supplierPayablesByCurrency} from '../dist/src/lib/payables.js';
import {treasuryProjection} from '../dist/src/lib/treasury-ledger.js';
import {scopeVault,applyWorkspaceScope,overlayWorkspaceScope} from '../dist/src/lib/workspaces.js';
import {mergeVaultIntent,sameDocumentContent} from '../dist/src/storage/vault-merge.js';
import {appendAuditEventsForVaultDiff} from '../dist/src/lib/audit-diff.js';
import {synchronizeActiveWorkspaceOnSave} from '../dist/src/storage/vault.js';
import {assertPlainCloudWorkspaceUploadable} from '../dist/src/cloud/plain-workspace.js';
import {approvalGate} from '../dist/src/lib/governance.js';
import {assertDocumentLifecycleInvariant,createDocumentEvent} from '../dist/src/lib/document-lifecycle.js';
import {isDeliveryLinkedInvoice,assertDeliveryInvoiceIntegrity} from '../dist/src/lib/sales-delivery-invoice.js';
import {confirmedSalesDeliveries} from '../dist/src/lib/sales-delivery-flow.js';
import {salesOrderForQuotation} from '../dist/src/lib/sales-order-flow.js';
import {assertCustomerCreditLimit} from '../dist/src/lib/commercial-controls.js';
import {assertInvoicePaymentInvariant} from '../dist/src/lib/payments.js';
import {documentUsesCommercialDefaults} from '../dist/src/lib/document-kinds.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {automaticElectronicDocument} from '../dist/src/lib/secure-share.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const asOf='2026-10-25';
const moneyState=vault=>({
  stock: inventoryBalances(vault.savedItems,vault.inventoryMovements).map(row=>[row.item.id,row.quantity]),
  movements:clone(vault.inventoryMovements),
  postedPurchases:clone(vault.purchases.filter(p=>p.status!=='draft')),
  issuedDocuments:clone(vault.documents.filter(d=>d.status==='final')),
  receivables:receivablesByCurrency(vault.documents,vault.payments,asOf),
  payables:supplierPayablesByCurrency(vault.purchases,vault.supplierPayments,asOf),
  treasury:treasuryProjection(vault.payments,vault.supplierPayments,vault.expenses,
    vault.treasuryEntries,vault.treasuryReconciliations,'USD',asOf),
  payments:clone(vault.payments),
  supplierPayments:clone(vault.supplierPayments),
  treasuryEntries:clone(vault.treasuryEntries),
  treasuryReconciliations:clone(vault.treasuryReconciliations),
  expenses:clone(vault.expenses),
  catalogCost:vault.savedItems.map(row=>[row.id,row.lastUnitCost,row.lastCostCurrency]),
});

async function fixture(){
  const base=emptyVault(),now=new Date().toISOString();
  const item={id:'axis28-stock-item',sku:'AXIS28-CARTONS',descriptionEn:'Synthetic Cartons',
    descriptionAr:'كراتين اختبار',unit:'Carton',hsCode:'',origin:'',packing:'',
    lastUnitPrice:'15.00',lastCurrency:'USD',lastUnitCost:'5.00',lastCostCurrency:'USD',
    createdAt:now,updatedAt:now,usageCount:0,lastUsedAt:now,
    inventoryTracking:'tracked',workspaceId:base.appSettings.activeWorkspaceId,
    branchId:base.appSettings.activeBranchId};
  const supplier=createSupplier();
  supplier.id='axis28-supplier';supplier.nameEn='Synthetic QA Supplier';
  base.savedItems=[item];base.suppliers=[supplier];
  const receipt=createPurchase([],[supplier],'USD');
  receipt.id='axis28-posted-receipt';receipt.number='PO-28-POSTED';
  receipt.date='2026-10-20';receipt.dueDate='2026-11-20';
  receipt.items=[{...createPurchaseItem(item),quantity:'200',unitCost:'5.00'}];
  const posted=postPurchase(receipt,base.savedItems,base.inventoryMovements);
  base.savedItems=posted.savedItems;
  base.purchases=[posted.purchase];
  base.inventoryMovements=posted.movements;
  const invoice=createBlankDocument('invoice','INV-QA-28-DRAFT',base.company);
  invoice.id='axis28-draft-invoice';invoice.status='draft';invoice.issueDate=asOf;
  invoice.dueDate='2026-11-25';
  invoice.customerSnapshot={sourceCustomerId:'axis28-buyer',
    companyNameEn:'Synthetic QA Buyer',companyNameAr:'',contactPerson:'',
    addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',
    vatTaxNumber:'',commercialRegistration:''};
  invoice.items=[{...invoice.items[0],id:'axis28-draft-invoice-line',
    savedItemId:item.id,skuSnapshot:item.sku,stockTreatment:'tracked',
    descriptionEn:item.descriptionEn,descriptionAr:'',
    unit:'Carton',quantity:'20',unitPrice:'15.00',unitCost:'5.00'}];
  const purchase=createPurchase(base.purchases,[supplier],'USD');
  purchase.id='axis28-draft-purchase';purchase.number='PO-28-DRAFT';
  purchase.date=asOf;purchase.dueDate='2026-11-25';
  purchase.items=[{...createPurchaseItem(item),quantity:'30',unitCost:'7.00'}];

  const full=applyWorkspaceScope(scopeVault(base),base);
  const uid='axis28-qa-account',state={uid,localRevision:'axis28-r1',payload:clone(full)};
  let stored=state,writes=0,syncs=0,blockNext=false;
  const toasts=[];
  const source=await readFile(new URL('../src/app/App.tsx',import.meta.url),'utf8');
  const segment=(start,end)=>{
    const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
    assert.ok(a>=0&&b>a,'App method boundaries must be present: '+start);
    return source.slice(a,b);
  };
  const methods=[
    segment('private persist=async(', 'private persistFullMutation=async('),
    segment('private saveDocument=async(', 'private beginRevision=async('),
    segment('private savePurchaseRecord=async(', 'private deletePurchaseRecord=async('),
  ].join('\n');
  const js=ts.transpileModule('class RealAppDraftHarness{\n'+methods+'\n}\nexports.RealAppDraftHarness=RealAppDraftHarness;',{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText;
  const ctx={exports:{},Error,Promise,structuredClone,
    scopeVault,applyWorkspaceScope,overlayWorkspaceScope,mergeVaultIntent,sameDocumentContent,
    appendAuditEventsForVaultDiff,synchronizeActiveWorkspaceOnSave,assertPlainCloudWorkspaceUploadable,
    currentCloudUser:()=>({uid}),activeAccountStorageUid:()=>uid,
    getPlainWorkspace:async()=>clone(stored),
    updatePlainWorkspaceIfUnchanged:async(account,revision,next)=>{
      if(blockNext||account!==uid||revision!==stored.localRevision)return null;
      writes+=1;stored={uid,localRevision:'axis28-r'+(writes+1),payload:clone(next)};
      return clone(stored);
    },
    t:en=>en,validatePurchase,
    isDeliveryLinkedInvoice,confirmedSalesDeliveries,salesOrderForQuotation,
    approvalGate,assertCustomerCreditLimit,assertInvoicePaymentInvariant,
    assertDocumentLifecycleInvariant,createDocumentEvent,
    documentUsesCommercialDefaults,assertDeliveryInvoiceIntegrity,
    postIssuedInvoiceStock,automaticElectronicDocument,
    ensureDocumentElectronicCopy:async()=>{throw Error('Drafts must not generate electronic finalized copies.')}
  };
  vm.runInNewContext(js,ctx);
  const app=new ctx.exports.RealAppDraftHarness();
  app.state={vault:clone(full),cloudUser:{uid},unlocked:true,editorDoc:null};
  app.requireVault=()=>scopeVault(app.state.vault);
  app.vaultWriteTail=Promise.resolve(null);
  app.waitForProtectedDataOperation=async()=>{};
  app.setState=(patch,cb)=>{Object.assign(app.state,patch);cb?.();};
  app.scheduleCloudSync=()=>{syncs++;};
  app.showToast=(message,tone)=>toasts.push({message,tone});
  app.accountEpoch=0;
  return {app,invoice,purchase,item,supplier,toasts,
    stored:()=>stored,counts:()=>({writes,syncs}),
    setBlocked:value=>{blockNext=value}};
}

test('28: real App draft invoice and draft purchase save/edit/reload leave stock, AR, AP, and treasury unchanged',async()=>{
  const f=await fixture();
  const initial=f.stored().payload;
  const opening=moneyState(initial);
  assert.deepEqual(opening.stock,[[f.item.id,'200']],'baseline stock is nonzero');
  assert.equal(opening.payables[0].remaining,'1000.00','posted receipt produces a real AP baseline');

  await f.app.saveDocument(f.invoice,false);
  await f.app.savePurchaseRecord(f.purchase);
  let persisted=clone(f.stored().payload);
  assert.equal(persisted.documents.find(x=>x.id===f.invoice.id).status,'draft');
  assert.equal(persisted.purchases.find(x=>x.id===f.purchase.id).status,'draft');
  assert.deepEqual(moneyState(persisted),opening,'first save is financially neutral');

  const newInvoice=clone(persisted.documents.find(x=>x.id===f.invoice.id));
  newInvoice.items[0].quantity='25';newInvoice.items[0].unitPrice='17.00';
  await f.app.saveDocument(newInvoice,false);
  const newPurchase=clone(f.stored().payload.purchases.find(x=>x.id===f.purchase.id));
  newPurchase.items[0].quantity='45';newPurchase.items[0].unitCost='8.00';
  newPurchase.notes='Synthetic revised draft with no posting';
  await f.app.savePurchaseRecord(newPurchase);

  persisted=clone(f.stored().payload);
  assert.equal(persisted.documents.find(x=>x.id===f.invoice.id).items[0].quantity,'25');
  assert.equal(persisted.purchases.find(x=>x.id===f.purchase.id).items[0].quantity,'45');
  assert.deepEqual(moneyState(persisted),opening,'draft editing cannot alter accounting ledgers or balances');
  assert.equal(persisted.inventoryMovements.filter(m=>m.sourceId===f.invoice.id||m.sourceId===f.purchase.id).length,0);
  assert.equal(persisted.documentEvents.filter(e=>e.documentId===f.invoice.id&&e.type==='issued').length,0);
  assert.deepEqual(f.counts(),{writes:4,syncs:4});
});

test('28: failed compare-and-swap save of invoice/purchase drafts preserves all ledger values and rejects false success',async()=>{
  const f=await fixture();
  const baseline=moneyState(f.stored().payload);
  f.setBlocked(true);
  const initialToasts=f.toasts.length;
  await assert.rejects(f.app.saveDocument(f.invoice,false),/Another tab updated this account/);
  assert.deepEqual(moneyState(f.stored().payload),baseline);
  assert.equal(f.stored().payload.documents.length,0,'failed invoice draft is not stored');
  assert.equal(f.toasts.length,initialToasts,'failed document save is not acknowledged');
  await assert.rejects(f.app.savePurchaseRecord(f.purchase),/Another tab updated this account/);
  assert.deepEqual(moneyState(f.stored().payload),baseline);
  assert.equal(f.stored().payload.purchases.filter(p=>p.status==='draft').length,0,'failed purchase draft not stored');
  assert.equal(f.toasts.length,initialToasts,'failed purchase save is not acknowledged');
  f.setBlocked(false);
  await f.app.saveDocument(f.invoice,false);
  await f.app.savePurchaseRecord(f.purchase);
  assert.deepEqual(moneyState(f.stored().payload),baseline);
});

test('28: mixed draft price changes never transform a posted receipt into an unpaid draft liability',async()=>{
  const f=await fixture();
  const baseline=moneyState(f.stored().payload);
  const edited={...f.purchase,items:f.purchase.items.map(item=>({...item,unitCost:'150.00'}))};
  await f.app.savePurchaseRecord(edited);
  const result=clone(f.stored().payload);
  assert.equal(result.purchases.filter(p=>p.status==='posted').length,1);
  assert.equal(result.purchases.filter(p=>p.status==='draft').length,1);
  assert.equal(supplierPayablesByCurrency(result.purchases,result.supplierPayments,asOf)[0].remaining,'1000.00');
  assert.deepEqual(moneyState(result),baseline);
});
