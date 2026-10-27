import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {synchronizeActiveWorkspaceOnSave} from '../dist/src/storage/vault.js';
import {assertPlainCloudWorkspaceUploadable} from '../dist/src/cloud/plain-workspace.js';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createCreditNoteDraft} from '../dist/src/lib/document-lifecycle.js';
import {createManualInventoryMovement,inventoryBalances} from '../dist/src/lib/operations.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {postSalesReturn} from '../dist/src/lib/sales-returns.js';
import {postVoidedInvoiceWithPhysicalReceipt} from '../dist/src/lib/invoice-void-stock.js';
import {readPlainBackup,assertRestorableBackupVault,assertPostedStockRestoreContinuity,assertFinancialRestoreContinuity} from '../dist/src/lib/backup.js';

const date=new Date().toISOString().slice(0,10);
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\nendobj\n');
const evidence=(id)=>({id,name:'goods-received.pdf',mimeType:'application/pdf',
  size:pdf.length,dataUrl:'data:application/pdf;base64,'+pdf.toString('base64'),createdAt:new Date().toISOString()});
function setup(){
 const vault=emptyVault(),now=new Date().toISOString();
 const item={id:'backup-stock-item',sku:'BK-STOCK',descriptionEn:'Recovered goods',descriptionAr:'بضاعة مرتجعة',
   hsCode:'',origin:'',packing:'',unit:'Carton',createdAt:now,updatedAt:now,
   lastUnitPrice:'10.00',lastCurrency:'USD',lastUnitCost:'4.50',lastCostCurrency:'USD',
   usageCount:0,lastUsedAt:now,workspaceId:vault.appSettings.activeWorkspaceId,
   branchId:vault.appSettings.activeBranchId};
 vault.savedItems=[item];
 vault.inventoryMovements=[createManualInventoryMovement(item,'opening','10',date,'QA opening stock')];
 const invoice=createBlankDocument('invoice','INV-BACKUP-SAFE',vault.company);
 invoice.issueDate=date;invoice.dueDate=date;invoice.status='final';
 invoice.customerSnapshot={sourceCustomerId:'test-buyer',companyNameEn:'Test Buyer',companyNameAr:'',
   contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',
   vatTaxNumber:'',commercialRegistration:''};
 invoice.items=[{...invoice.items[0],id:'backup-invoice-line',quantity:'4',unit:'Carton',
   unitPrice:'10.00',descriptionEn:item.descriptionEn,savedItemId:item.id,
   stockTreatment:'tracked',skuSnapshot:item.sku}];
 vault.documents=[invoice];
 return {issued:postIssuedInvoiceStock(vault,invoice).vault,invoice,item};
}
const quantity=(v)=>inventoryBalances(v.savedItems,v.inventoryMovements)
 .find(x=>x.item.id==='backup-stock-item')?.quantity;
const serialize=(vault)=>new File([JSON.stringify({
 format:'LOUREX_WORKSPACE_EXPORT_V2',version:2,createdAt:new Date().toISOString(),payload:vault
})],'LOUREX-TEST.lourex-json',{type:'application/json'});
const clone=x=>structuredClone(x);

test('portable local backup and cloud hydration preserve the issued invoice and verified partial receipt exactly',async()=>{
 const {issued,invoice}=setup();
 const credit={...createCreditNoteDraft(invoice,'CN-BACKUP-SAFE','40.00'),status:'final',issueDate:date};
 credit.items=[{...credit.items[0],id:'backup-credit-line',quantity:'2',unitPrice:'10.00'}];
 const withCredit={...issued,documents:[...issued.documents,credit]};
 const withReturn=postSalesReturn(withCredit,{
  creditNoteId:credit.id,creditLineId:credit.items[0].id,invoiceLineId:invoice.items[0].id,
  warehouseId:issued.warehouses[0].id,quantity:'1.5',date,
  reason:'Verified return with actual PDF source',evidence:evidence('return-receipt-001'),operatorId:'owner'
 }).vault;
 assert.equal(quantity(withReturn),'7.5');
 assert.doesNotThrow(()=>assertRestorableBackupVault(withReturn));
 const restored=await readPlainBackup(serialize(withReturn));
 assert.deepEqual(restored,withReturn);
 assert.equal(restored.inventoryMovements.filter(row=>row.type==='issue').length,1);
 assert.equal(restored.inventoryMovements.filter(row=>row.salesReturn).length,1);
 assert.equal(quantity(restored),'7.5');
});

test('edited or orphaned physical return cannot be imported or installed from cloud',async()=>{
 const {issued,invoice}=setup();
 const credit={...createCreditNoteDraft(invoice,'CN-BACKUP-TAMPER','40.00'),status:'final',issueDate:date};
 credit.items=[{...credit.items[0],id:'backup-credit-line-tamper',quantity:'2',unitPrice:'10.00'}];
 const initial={...issued,documents:[...issued.documents,credit]};
 const valid=postSalesReturn(initial,{
   creditNoteId:credit.id,creditLineId:credit.items[0].id,invoiceLineId:invoice.items[0].id,
   warehouseId:initial.warehouses[0].id,quantity:'1.5',date,
   reason:'Actual sealed cartons returned',evidence:evidence('qa-proof-002'),operatorId:'owner'
 }).vault;
 const corruptions=[
  x=>{x.inventoryMovements.find(m=>m.salesReturn).quantity='7.5000';},
  x=>{x.inventoryMovements.find(m=>m.salesReturn).salesReturn.invoiceLineId='forged-line';},
  x=>{x.inventoryMovements.find(m=>m.salesReturn).evidence.dataUrl='data:application/pdf;base64,aGVsbG8=';},
  x=>{x.documents=x.documents.filter(d=>d.id!==credit.id);},
  x=>{x.inventoryMovements=x.inventoryMovements.filter(m=>m.type!=='issue');}
 ];
 for(const tamper of corruptions){
  const changed=clone(valid);tamper(changed);
  assert.throws(()=>assertRestorableBackupVault(changed),/Backup posted-invoice stock ledger/);
  await assert.rejects(readPlainBackup(serialize(changed)),/Backup posted-invoice stock ledger/);
 }
 assert.equal(quantity(valid),'7.5','rejected files cannot change existing in-memory financial state');
});

test('voided invoice must retain its complete physical return and proof in restored backups',async()=>{
 const {issued,invoice}=setup();
 const voided=postVoidedInvoiceWithPhysicalReceipt(issued,invoice,{
   reason:'All four cartons physically back and confirmed by warehouse',
   date,evidence:evidence('qa-proof-void'),operatorId:'owner'
 }).vault;
 assert.equal(quantity(voided),'10');
 const restored=await readPlainBackup(serialize(voided));
 assert.equal(restored.documents[0].lifecycleStatus,'voided');
 assert.equal(restored.inventoryMovements.filter(m=>m.invoiceVoidStock).length,1);
 assert.equal(restored.documents[0].attachments.at(-1).id,'qa-proof-void');
 const proofErased=clone(voided);
 proofErased.documents[0].attachments=[];
 assert.throws(()=>assertRestorableBackupVault(proofErased),/Backup posted-invoice stock ledger/);
 const returnErased=clone(voided);
 returnErased.inventoryMovements=returnErased.inventoryMovements.filter(m=>!m.invoiceVoidStock);
 assert.throws(()=>assertRestorableBackupVault(returnErased),/Backup posted-invoice stock ledger/);
});


test('manual restore cannot silently roll back an already posted invoice stock debit',async()=>{
 const {issued,invoice}=setup();
 const old=emptyVault();
 assert.doesNotThrow(()=>assertRestorableBackupVault(old),'a formerly valid backup passes shape validation');
 assert.throws(()=>assertPostedStockRestoreContinuity(issued,old),/older local copy would erase or modify/);
 const restored=await readPlainBackup(serialize(issued));
 assert.doesNotThrow(()=>assertPostedStockRestoreContinuity(issued,restored),'identical posted stock audit is recoverable');
 const cleared=clone(issued);
 cleared.inventoryMovements=cleared.inventoryMovements.filter(row=>!row.id.startsWith('sales-invoice-stock:'));
 assert.throws(()=>assertPostedStockRestoreContinuity(issued,cleared),/posted invoice stock/);
 const rewrittenInvoice=clone(issued);
 rewrittenInvoice.documents[0].items[0].quantity='7';
 assert.throws(()=>assertPostedStockRestoreContinuity(issued,rewrittenInvoice),/posted invoice stock/);
 assert.equal(quantity(issued),'6','blocked restore preserves existing invoice stock');
});

test('restore continuity protects a voided invoice, credit note and return proof without blocking unrelated data',()=>{
 const {issued,invoice}=setup();
 const returned=postVoidedInvoiceWithPhysicalReceipt(issued,invoice,{
  reason:'All cartons back in warehouse verified by PDF',date,evidence:evidence('restore-evidence-1'),operatorId:'owner'
 }).vault;
 const compatible=clone(returned);
 compatible.customers=[...compatible.customers,{id:'unrelated-new-customer'}];
 assert.doesNotThrow(()=>assertPostedStockRestoreContinuity(returned,compatible));
 const older=clone(returned);
 older.documents[0].attachments=[];
 assert.throws(()=>assertPostedStockRestoreContinuity(returned,older),/posted invoice stock/);
 const erased=clone(returned);
 erased.inventoryMovements=erased.inventoryMovements.filter(m=>!m.invoiceVoidStock);
 assert.throws(()=>assertPostedStockRestoreContinuity(returned,erased),/posted invoice stock/);
});

// JSON object member order is serialization detail; arrays and values are evidence.
const reorderKeys=value=>Array.isArray(value)?value.map(reorderKeys):value&&typeof value==='object'
 ?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorderKeys(item)])):value;
for(const collection of ['documents','inventoryMovements'])test(`identical posted ${collection} survives backup key reordering`,async()=>{
 const {issued}=setup(),copy=clone(issued);copy[collection]=reorderKeys(copy[collection]);
 const restored=await readPlainBackup(serialize(copy));
 assert.doesNotThrow(()=>assertPostedStockRestoreContinuity(issued,restored));
 assert.deepEqual(restored,issued);assert.equal(quantity(restored),'6');
});

test('restore comparison still protects every value, nested evidence and array order',()=>{
 const {issued}=setup();issued.documents[0].attachments=[evidence('order-a'),evidence('order-b')];
 const changes=[
  v=>{v.inventoryMovements.find(m=>m.id.startsWith('sales-invoice-stock:')).quantity='-9';},
  v=>{v.inventoryMovements.find(m=>m.id.startsWith('sales-invoice-stock:')).note='Changed evidence';},
  v=>{v.documents[0].updatedAt='2099-01-01T00:00:00.000Z';},
  v=>{v.documents[0].attachments[0].dataUrl='changed';},
  v=>{v.documents[0].attachments.reverse();},
  v=>{v.documents=[];}
 ];
 for(const change of changes){const copy=reorderKeys(issued);change(copy);assert.throws(()=>assertPostedStockRestoreContinuity(issued,copy),/erase or modify posted invoice stock/);}
});

async function restoreHarness(initial,rejectCas=false){
 let stored={id:'workspace-v2',uid:'qa-stock-restore',schemaVersion:initial.schemaVersion,payload:clone(initial),localRevision:'before-restore',baseCloudRevision:'cloud-base',baseCloudSha256:'a'.repeat(64)},writes=0,syncs=0,ends=0;
 const context={exports:{},Error,Promise,Date,crypto:webcrypto,readPlainBackup,synchronizeActiveWorkspaceOnSave,assertPlainCloudWorkspaceUploadable,assertPostedStockRestoreContinuity,assertFinancialRestoreContinuity,t:en=>en,
  currentCloudUser:()=>({uid:stored.uid}),getPlainWorkspace:async()=>clone(stored),
  replacePlainWorkspaceIfUnchanged:async(uid,revision,replacement,reason)=>{
   assert.equal(uid,stored.uid);assert.equal(revision,stored.localRevision);assert.equal(reason,'replaced-by-backup');
   if(rejectCas)return false;writes++;stored=clone(replacement);return true;
  }};
 const source=await readFile('src/app/App.tsx','utf8'),parsed=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const cls=parsed.statements.find(ts.isClassDeclaration),members=cls.members.filter(n=>['restore','normalizedVault'].includes(n.name?.getText(parsed))).map(n=>n.getText(parsed));assert.equal(members.length,2);
 vm.runInNewContext(ts.transpileModule('class Harness{'+members.join('\n')+'}\nexports.Harness=Harness;',{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
 }).outputText,context);
 const h=new context.exports.Harness();h.state={vault:clone(initial),cloudUser:{uid:stored.uid},cloudSyncState:'synced',uiLanguage:'en'};
 h.editorMustBeClosed=()=>{};h.beginProtectedOperation=async()=>{};h.endProtectedOperation=()=>ends++;
 h.setState=(patch,done)=>{Object.assign(h.state,patch);done?.();};h.scheduleCloudSync=delay=>{assert.equal(delay,300);syncs++;};
 return{h,get:()=>stored,counts:()=>({writes,syncs,ends})};
}
test('actual App.restore accepts identical reordered stock evidence and retains stored audit identities',async()=>{
 const {issued}=setup();issued.documentEvents=[{id:'qa-preserved-event',documentId:issued.documents[0].id,type:'created',at:'2026-10-01T00:00:00.000Z',note:'Existing audit evidence',workspaceId:'default',branchId:'main'}];
 const p=await restoreHarness(issued);await p.h.restore(serialize(reorderKeys(issued)));
 assert.deepEqual(p.get().payload.documents,issued.documents);assert.deepEqual(p.get().payload.inventoryMovements,issued.inventoryMovements);
 assert.deepEqual(p.get().payload.documentEvents,issued.documentEvents);assert.deepEqual(p.h.state.vault.documentEvents,issued.documentEvents);
 assert.deepEqual(p.counts(),{writes:1,syncs:1,ends:1});assert.equal(p.get().baseCloudRevision,'cloud-base');
});
test('actual App.restore rejects changed protected invoice metadata before CAS without partial UI or sync changes',async()=>{
 const {issued}=setup(),p=await restoreHarness(issued),copy=reorderKeys(issued);
 copy.documents[0].updatedAt='2099-01-01T00:00:00.000Z';
 const before=JSON.stringify(p.get()),ui=JSON.stringify(p.h.state.vault);
 await assert.rejects(p.h.restore(serialize(copy)),/erase or modify posted invoice stock/);
 assert.equal(JSON.stringify(p.get()),before);assert.equal(JSON.stringify(p.h.state.vault),ui);assert.deepEqual(p.counts(),{writes:0,syncs:0,ends:1});
});
test('actual App.restore still rejects a lost CAS after equivalent reordered evidence passed',async()=>{
 const {issued}=setup(),p=await restoreHarness(issued,true),before=JSON.stringify(p.get()),ui=JSON.stringify(p.h.state.vault);
 await assert.rejects(p.h.restore(serialize(reorderKeys(issued))),/Account data changed during import/);
 assert.equal(JSON.stringify(p.get()),before);assert.equal(JSON.stringify(p.h.state.vault),ui);assert.deepEqual(p.counts(),{writes:0,syncs:0,ends:1});
});

test('reordered nested physical-return evidence roundtrips without weakening its protection',async()=>{
 const {issued,invoice}=setup();
 const returned=postVoidedInvoiceWithPhysicalReceipt(issued,invoice,{
  reason:'All cartons physically returned with evidence',date,evidence:evidence('reordered-return-proof'),operatorId:'owner'
 }).vault;
 const restored=await readPlainBackup(serialize(reorderKeys(returned)));
 assert.doesNotThrow(()=>assertPostedStockRestoreContinuity(returned,restored));
 assert.deepEqual(restored,returned);assert.equal(quantity(restored),'10');
 restored.inventoryMovements.find(m=>m.invoiceVoidStock).invoiceVoidStock.invoiceId='changed-source';
 assert.throws(()=>assertPostedStockRestoreContinuity(returned,restored),/erase or modify/);
});


function postedFinanceFixture(){
 const {issued}=setup();
 const pay={id:'qa-customer-paid-50',invoiceId:issued.documents[0].id,
   customerId:'test-buyer',currency:'USD',amount:'50.00',
   date:'2026-10-11',workspaceId:'default',branchId:'main',
   voidedAt:'',reference:'QA-AR-50'};
 const supplier={id:'qa-supplier-paid-30',purchaseId:'qa-supplier-purchase',
   supplierId:'qa-supplier',currency:'USD',amount:'30.00',
   date:'2026-10-11',workspaceId:'default',branchId:'main',
   voidedAt:'',reference:'QA-AP-30'};
 const ledger=[
  {id:'qa-opening-bank-100',type:'opening-balance',amount:'100.00',currency:'USD',
   date:'2026-10-11',toAccountId:'qa-bank',workspaceId:'default',branchId:'main'},
  {id:'qa-bank-receipt-50',type:'collection',sourceType:'customer-payment',
   sourceId:pay.id,amount:'50.00',currency:'USD',date:'2026-10-11',
   toAccountId:'qa-bank',workspaceId:'default',branchId:'main'},
  {id:'qa-bank-supplier-30',type:'supplier-payment',sourceType:'supplier-payment',
   sourceId:supplier.id,amount:'30.00',currency:'USD',date:'2026-10-11',
   fromAccountId:'qa-bank',workspaceId:'default',branchId:'main'}
 ];
 const reconciled={id:'qa-reconciliation',movementKey:'treasury:qa-bank-receipt-50',
   workspaceId:'default',branchId:'main',createdAt:'2026-10-12T00:00:00.000Z'};
 return {...issued,payments:[pay],supplierPayments:[supplier],
   treasuryEntries:ledger,treasuryReconciliations:[reconciled]};
}

test('finance local restore cannot erase paid AR/AP, bank movements or reconciliation audit',()=>{
 const previous=postedFinanceFixture(),original=JSON.stringify(previous);
 const kinds=['payments','supplierPayments','treasuryEntries','treasuryReconciliations'];
 for(const key of kinds){
  const older=clone(previous);
  older[key]=older[key].slice(1);
  assert.doesNotThrow(()=>assertPostedStockRestoreContinuity(previous,older),
    'stock protection alone cannot notice the missing financial posting');
  assert.throws(()=>assertFinancialRestoreContinuity(previous,older),
    /erase or modify existing payment, supplier settlement, or bank audit history/i);
  assert.equal(JSON.stringify(previous),original,'failed validation cannot mutate account history');
 }
});

test('finance local restore rejects rewritten payment amounts, void status and duplicate bank IDs',()=>{
 const initial=postedFinanceFixture();
 for(const change of [
  vault=>{vault.payments[0].amount='5.00';},
  vault=>{vault.supplierPayments[0].voidedAt='2026-10-12T10:00:00.000Z';},
  vault=>{vault.treasuryEntries[1].amount='500.00';},
  vault=>{vault.treasuryReconciliations[0].movementKey='treasury:another-bank-entry';},
  vault=>{vault.treasuryEntries.push(clone(vault.treasuryEntries[1]));},
 ]){
  const edited=clone(initial);change(edited);
  assert.throws(()=>assertFinancialRestoreContinuity(initial,edited),
    /erase or modify existing payment, supplier settlement, or bank audit history/);
 }
});

test('finance local restore preserves equivalent immutable financial history across key and row ordering',()=>{
 const initial=postedFinanceFixture(),candidate=reorderKeys(initial);
 for(const kind of ['payments','supplierPayments','treasuryEntries','treasuryReconciliations'])
  candidate[kind].reverse();
 candidate.customers=[...candidate.customers,{id:'synthetic-extra-customer'}];
 assert.doesNotThrow(()=>assertFinancialRestoreContinuity(initial,candidate));
 const added=clone(candidate);
 added.payments.push({...initial.payments[0],id:'additional-new-receipt'});
 assert.doesNotThrow(()=>assertFinancialRestoreContinuity(initial,added));
 assert.doesNotThrow(()=>assertFinancialRestoreContinuity(emptyVault(),initial),
  'fresh device recovery may import financial history with no existing posting');
});

test('actual App.restore rejects stale bank/payment snapshots before CAS or cloud sync',async()=>{
 const initial=postedFinanceFixture(),before=JSON.stringify(initial);
 for(const key of ['payments','supplierPayments','treasuryEntries','treasuryReconciliations']){
  const p=await restoreHarness(initial),older=clone(initial);
  older[key]=older[key].slice(1);
  const stored=JSON.stringify(p.get()),ui=JSON.stringify(p.h.state.vault);
  await assert.rejects(p.h.restore(serialize(older)),
    /erase or modify existing payment, supplier settlement, or bank audit history/);
  assert.equal(JSON.stringify(p.get()),stored,'restore must not overwrite prior financial data');
  assert.equal(JSON.stringify(p.h.state.vault),ui,'UI cannot display a rejected older ledger');
  assert.deepEqual(p.counts(),{writes:0,syncs:0,ends:1},
    'refused financial restore must not trigger a cloud push');
 }
 assert.equal(JSON.stringify(initial),before);
});

test('actual App.restore still accepts identical financial ledger with newer unrelated records',async()=>{
 const initial=postedFinanceFixture(),p=await restoreHarness(initial);
 const incoming=clone(initial);
 incoming.customers.push({id:'qa-unrelated-customer'});
 await p.h.restore(serialize(incoming));
 assert.equal(p.get().payload.customers.at(-1).id,'qa-unrelated-customer');
 assert.equal(p.get().payload.payments[0].amount,'50.00');
 assert.equal(p.get().payload.supplierPayments[0].amount,'30.00');
 assert.equal(p.get().payload.treasuryEntries.length,3);
 assert.equal(p.get().payload.treasuryReconciliations.length,1);
 assert.deepEqual(p.counts(),{writes:1,syncs:1,ends:1});
});
