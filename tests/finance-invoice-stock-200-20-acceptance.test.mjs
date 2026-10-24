import test from 'node:test';
import assert from 'node:assert/strict';

import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {
  createSupplier, createPurchase, createPurchaseItem, postPurchase, inventoryBalances
} from '../dist/src/lib/operations.js';
import {postIssuedInvoiceStock, INVOICE_STOCK_PREFIX} from '../dist/src/lib/invoice-stock.js';
import {defaultWarehouseId, warehouseItemQuantity} from '../dist/src/lib/warehouses.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

const reopen=value=>JSON.parse(JSON.stringify(value));
const stockOf=(vault,itemId)=>
  inventoryBalances(vault.savedItems,vault.inventoryMovements)
    .find(row=>row.item.id===itemId)?.quantity;

function isolatedCartonFixture(){
  const now=new Date().toISOString(),today=now.slice(0,10),base=emptyVault();
  const item={
    id:'qa-cartons-item',sku:'QA-CARTON-200-20',descriptionEn:'Synthetic QA Cartons',
    descriptionAr:'كراتين اختبار',unit:'Carton',hsCode:'',origin:'',packing:'',
    lastUnitPrice:'5.00',lastCurrency:'USD',lastUnitCost:'2.00',
    lastCostCurrency:'USD',usageCount:0,lastUsedAt:now,createdAt:now,
    updatedAt:now,workspaceId:base.appSettings.activeWorkspaceId,
    branchId:base.appSettings.activeBranchId,inventoryTracking:'tracked'
  };
  const supplier=createSupplier();
  supplier.nameEn='Synthetic QA Supplier';
  let vault={...base,savedItems:[item],suppliers:[supplier]};
  const persist=intent=>{vault=reopen(mergeVaultIntent(vault,intent,vault));};
  // A posted synthetic purchase provides 200 real ledger units, without
  // bypassing the separately required documentary proof for manual movements.
  const draftPurchase=createPurchase([], [supplier], 'USD');
  draftPurchase.items=[{
    ...createPurchaseItem(item),quantity:'200',unitCost:'2.00'
  }];
  persist({...vault,purchases:[draftPurchase]});
  const receipt=postPurchase(vault.purchases[0],vault.savedItems,vault.inventoryMovements);
  persist({...vault,purchases:[receipt.purchase],savedItems:receipt.savedItems,
    inventoryMovements:receipt.movements});
  const invoice=createBlankDocument('invoice','INV-QA-CARTON-200-20',vault.company);
  invoice.issueDate=today;
  invoice.dueDate=today;
  invoice.status='draft';
  invoice.customerSnapshot={
    sourceCustomerId:'qa-carton-buyer',companyNameEn:'Synthetic QA Buyer',
    companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',
    country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''
  };
  invoice.items=[{
    ...invoice.items[0],id:'qa-carton-invoice-line',descriptionEn:item.descriptionEn,
    descriptionAr:item.descriptionAr,unit:'Carton',quantity:'20',
    unitPrice:'5.00',unitCost:'2.00',savedItemId:item.id,
    skuSnapshot:item.sku,stockTreatment:'tracked'
  }];
  return {vault,item,invoice,persist,read:()=>vault};
}

test('200 cartons -> draft 200 -> final invoice of 20 -> 180, one immutable linked issue through saved vault and reload',()=>{
  const {item,invoice,persist,read}=isolatedCartonFixture();
  const original=read();
  const warehouse=defaultWarehouseId(original.appSettings.activeBranchId);
  assert.equal(stockOf(original,item.id),'200');
  assert.equal(warehouseItemQuantity(item.id,warehouse,original.inventoryMovements,warehouse),2000000n);

  // The draft must not post stock even when the user saves it.
  persist({...read(),documents:[invoice]});
  assert.equal(postIssuedInvoiceStock(read(),invoice).created,false);
  assert.equal(stockOf(read(),item.id),'200');
  assert.equal(read().inventoryMovements.filter(row=>row.sourceId===invoice.id).length,0);

  // Actual save path's one logical transaction contains both the final
  // document and the automatically generated, catalog-linked stock debit.
  const issued={...read().documents[0],status:'final'};
  const intent=postIssuedInvoiceStock({...read(),documents:[issued]},issued);
  assert.equal(intent.created,true);
  persist(intent.vault);

  let saved=read();
  assert.equal(saved.documents.find(doc=>doc.id===issued.id)?.status,'final');
  assert.equal(stockOf(saved,item.id),'180');
  assert.equal(warehouseItemQuantity(item.id,warehouse,saved.inventoryMovements,warehouse),1800000n);
  const generated=saved.inventoryMovements.filter(m=>m.sourceId===issued.id);
  assert.equal(generated.length,1);
  assert.equal(generated[0].id,INVOICE_STOCK_PREFIX+issued.id+':'+issued.items[0].id);
  assert.equal(generated[0].sourceNumber,issued.number);
  assert.equal(generated[0].type,'issue');
  assert.equal(generated[0].quantity,'-20.0000');
  assert.equal(generated[0].itemId,item.id);
  assert.equal(generated[0].sku,item.sku);
  assert.equal(generated[0].fromWarehouseId,warehouse);

  // Repeating the post and reopening/merging persisted data must not
  // produce another -20 debit.
  const again=postIssuedInvoiceStock(saved,issued);
  assert.equal(again.created,false);
  assert.equal(again.vault,saved);
  saved=reopen(mergeVaultIntent(saved,reopen(saved),reopen(saved)));
  assert.equal(stockOf(saved,item.id),'180');
  assert.equal(saved.inventoryMovements.filter(m=>m.sourceId===issued.id).length,1);

  // Oversell must fail before any ledger mutation.
  const oversized={...issued,id:'qa-cartons-oversell',number:'INV-QA-OVERSELL',
    items:[{...issued.items[0],id:'qa-carton-oversell-line',quantity:'181'}]};
  const snapshot=JSON.stringify(saved);
  assert.throws(()=>postIssuedInvoiceStock(
    {...saved,documents:[...saved.documents,oversized]},oversized
  ),/Insufficient stock for invoice issue/);
  assert.equal(JSON.stringify(saved),snapshot);
});

/*
 * Second acceptance gate: exercise the actual App.saveDocument implementation
 * and its queued IndexedDB compare-and-swap commit, not only the pure stock
 * domain function. This intentionally runs under Node, without a browser,
 * cloud account, production record, or full application build.
 */
test('real App.saveDocument: draft 200, rejected final save 200, committed final 180 and one stock movement',async()=>{
  const [{readFile},{default:vm},{default:ts},workspace,audit,cloud,periods,governance,lifecycle,deliveries,commercial,payments,kinds,shares]=await Promise.all([
    import('node:fs/promises'),import('node:vm'),import('typescript'),
    import('../dist/src/lib/workspaces.js'),
    import('../dist/src/lib/audit-diff.js'),
    import('../dist/src/cloud/plain-workspace.js'),
    import('../dist/src/storage/vault.js'),
    import('../dist/src/lib/governance.js'),
    import('../dist/src/lib/document-lifecycle.js'),
    import('../dist/src/lib/sales-delivery-invoice.js'),
    import('../dist/src/lib/commercial-controls.js'),
    import('../dist/src/lib/payments.js'),
    import('../dist/src/lib/document-kinds.js'),
    import('../dist/src/lib/secure-share.js')
  ]);
  const [{isDeliveryLinkedInvoice},{confirmedSalesDeliveries},{salesOrderForQuotation}]=await Promise.all([
    import('../dist/src/lib/sales-delivery-invoice.js'),
    import('../dist/src/lib/sales-delivery-flow.js'),
    import('../dist/src/lib/sales-order-flow.js')
  ]);
  const {sameDocumentContent}=await import('../dist/src/storage/vault-merge.js');
  const file=await readFile(new URL('../src/app/App.tsx',import.meta.url),'utf8');
  const saveStart=file.indexOf('private saveDocument=async(');
  const saveEnd=file.indexOf('private beginRevision=async(',saveStart);
  const persistStart=file.indexOf('private persist=async(');
  const persistEnd=file.indexOf('private persistFullMutation=async(',persistStart);
  assert.ok(saveStart>0&&saveEnd>saveStart&&persistStart>0&&persistEnd>persistStart,
    'production App save and queue methods must remain available for this acceptance gate');

  const {vault,item,invoice}=isolatedCartonFixture();
  const full={...vault,documents:[invoice]};
  const accountUid='synthetic-qa-account-only';
  let stored={uid:accountUid,localRevision:'qa-stock-r1',payload:reopen(full)};
  let blocked=false,commits=0;
  const shareCalls=[];
  const context={
    exports:{},Error,Promise,structuredClone,
    scopeVault:workspace.scopeVault,
    applyWorkspaceScope:workspace.applyWorkspaceScope,
    overlayWorkspaceScope:workspace.overlayWorkspaceScope,
    mergeVaultIntent,sameDocumentContent,
    t:english=>english,
    isDeliveryLinkedInvoice,confirmedSalesDeliveries,salesOrderForQuotation,
    assertInvoicePaymentInvariant:payments.assertInvoicePaymentInvariant,
    assertCustomerCreditLimit:commercial.assertCustomerCreditLimit,
    approvalGate:governance.approvalGate,
    assertDocumentLifecycleInvariant:lifecycle.assertDocumentLifecycleInvariant,
    createDocumentEvent:lifecycle.createDocumentEvent,
    documentUsesCommercialDefaults:kinds.documentUsesCommercialDefaults,
    assertDeliveryInvoiceIntegrity:deliveries.assertDeliveryInvoiceIntegrity,
    postIssuedInvoiceStock,
    automaticElectronicDocument:shares.automaticElectronicDocument,
    ensureDocumentElectronicCopy:async document=>{shareCalls.push(document.id);return{id:'qa-copy'};},
    appendAuditEventsForVaultDiff:audit.appendAuditEventsForVaultDiff,
    synchronizeActiveWorkspaceOnSave:periods.synchronizeActiveWorkspaceOnSave,
    assertPlainCloudWorkspaceUploadable:cloud.assertPlainCloudWorkspaceUploadable,
    currentCloudUser:()=>({uid:accountUid}),
    activeAccountStorageUid:()=>accountUid,
    getPlainWorkspace:async()=>reopen(stored),
    updatePlainWorkspaceIfUnchanged:async(uid,rev,next)=>{
      if(blocked||uid!==accountUid||rev!==stored.localRevision)return null;
      commits++;
      stored={uid:accountUid,localRevision:'qa-stock-r'+(commits+1),payload:reopen(next)};
      return stored;
    }
  };
  const script=ts.transpileModule(
    'class AppStockHarness{'+file.slice(persistStart,persistEnd)+file.slice(saveStart,saveEnd)
    +'}\nexports.AppStockHarness=AppStockHarness;',
    {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}
  ).outputText;
  vm.runInNewContext(script,context);
  const h=new context.exports.AppStockHarness();
  const notices=[];
  h.state={vault:reopen(full),cloudUser:{uid:accountUid},unlocked:true,editorDoc:reopen(invoice)};
  h.requireVault=()=>workspace.scopeVault(h.state.vault);
  h.vaultWriteTail=Promise.resolve(null);
  h.waitForProtectedDataOperation=async()=>{};
  h.setState=(patch,cb)=>{Object.assign(h.state,patch);cb?.();};
  h.scheduleCloudSync=()=>{};
  h.showToast=(message,type)=>notices.push({message,type});

  // A real manual draft save is allowed, but no stock is issued.
  await h.saveDocument({...invoice,notes:'Synthetic saved draft'},false);
  const savedDraft=stored.payload.documents.find(doc=>doc.id===invoice.id);
  assert.ok(savedDraft);
  assert.equal(savedDraft.status,'draft');
  assert.equal(stockOf(stored.payload,item.id),'200');
  assert.equal(stored.payload.inventoryMovements.filter(m=>m.sourceId===invoice.id).length,0);
  assert.equal(commits,1);

  // Force the actual App CAS storage commit to fail, never acknowledge a
  // half-issued invoice, and never leave a stock debit behind.
  const final={...savedDraft,status:'final'};
  const beforeFailure=JSON.stringify(stored.payload);
  blocked=true;
  await assert.rejects(h.saveDocument(final,false),/Another tab updated/i);
  assert.equal(JSON.stringify(stored.payload),beforeFailure);
  assert.equal(stockOf(stored.payload,item.id),'200');
  assert.equal(commits,1);
  assert.equal(notices.filter(n=>n.type==='success').length,1,
    'failed final save must not acknowledge issuance');
  assert.equal(shareCalls.length,0);

  // Retry only after simulated storage recovers, verifying the real
  // App method commits issued invoice + movement as one stored revision.
  blocked=false;
  await h.saveDocument(final,false);
  const saved=stored.payload;
  assert.equal(commits,2);
  assert.equal(saved.documents.find(doc=>doc.id===invoice.id)?.status,'final');
  assert.equal(stockOf(saved,item.id),'180');
  const issues=saved.inventoryMovements.filter(m=>m.sourceId===invoice.id);
  assert.equal(issues.length,1);
  assert.equal(issues[0].type,'issue');
  assert.equal(issues[0].quantity,'-20.0000');
  assert.equal(issues[0].sourceNumber,invoice.number);
  assert.equal(issues[0].sku,item.sku);
  assert.equal(issues[0].fromWarehouseId,defaultWarehouseId(saved.appSettings.activeBranchId));
  assert.equal(stockOf(reopen(saved),item.id),'180');
  assert.equal(reopen(saved).inventoryMovements.filter(m=>m.sourceId===invoice.id).length,1);
});
