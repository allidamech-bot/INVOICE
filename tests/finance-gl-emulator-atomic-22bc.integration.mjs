import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase} from '../dist/src/lib/operations.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {defaultWarehouseId} from '../dist/src/lib/warehouses.js';
import {createPeriodService} from '../api/_accounting/period-store.js';
import {encodeWorkspace} from '../api/_accounting/period-format.js';
import {fingerprintSyntheticFinanceSources} from '../api/_accounting/finance-gl-atomic-contract.js';
import {createFinanceGlQaEmulatorService} from './helpers/finance-gl-qa-firestore-adapter.mjs';

// Run only under firebase-tools emulators:exec on the fixed demo project.
// Neither Admin credentials nor a production Firebase project may enter.
const PROJECT='demo-lourex-gl-qa';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))
  throw Error('LIVE_FIRESTORE_FORBIDDEN: a local Firestore Emulator is mandatory.');
const app=initializeApp({projectId:PROJECT},'finance-gl-qa-'+randomBytes(4).toString('hex'));
const db=getFirestore(app);
const periodService=createPeriodService(db);
const service=createFinanceGlQaEmulatorService(db);
const uid=()=>randomBytes(16).toString('hex');
const plain=x=>JSON.parse(JSON.stringify(x));
const scopeKey='default-main';

function syntheticSources(){
 const vault=emptyVault(),supplier={...createSupplier(),id:'QA-vendor',nameEn:'QA vendor'};
 const item={id:'QA-cartons',sku:'CARTON-TEST',descriptionEn:'QA carton',descriptionAr:'',
  unit:'Carton',workspaceId:'default',branchId:'main',inventoryTracking:'tracked',
  lastUnitCost:'',lastCostCurrency:'',lastUnitPrice:'8',lastCurrency:'USD',
  createdAt:'2026-10-18T00:00:00Z',updatedAt:'2026-10-18T00:00:00Z'};
 vault.savedItems=[item];vault.suppliers=[supplier];
 const purchase=createPurchase([],[supplier],'USD');
 Object.assign(purchase,{id:'QA-buy',number:'PUR-QA',date:'2026-10-19',
  dueDate:'2026-10-19',workspaceId:'default',branchId:'main',currency:'USD',
  freight:'0.00',duty:'0.00',otherCosts:'0.00'});
 purchase.items=[{...createPurchaseItem(item),id:'QA-purchase-line',
  quantity:'2',unitCost:'5'}];
 const bought=postPurchase(purchase,vault.savedItems,[]);
 vault.purchases=[{...bought.purchase,workspaceId:'default',branchId:'main'}];
 vault.inventoryMovements=bought.movements.map(x=>({...x,workspaceId:'default',branchId:'main'}));
 vault.savedItems=bought.savedItems;
 const invoice=createBlankDocument('invoice','INV-QA',vault.company);
 Object.assign(invoice,{id:'QA-invoice',number:'INV-QA',currency:'USD',
  status:'final',role:'standard',issueDate:'2026-10-22',dueDate:'2026-10-22',
  workspaceId:'default',branchId:'main'});
 invoice.customerSnapshot={
  sourceCustomerId:'QA-customer',companyNameEn:'QA buyer',companyNameAr:'',
  contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',
  email:'',vatTaxNumber:'',commercialRegistration:''
 };
 invoice.items=[{...invoice.items[0],id:'QA-sale-line',descriptionEn:'QA carton',
  unit:'Carton',quantity:'1',unitPrice:'8',unitCost:'5',
  stockTreatment:'tracked',savedItemId:item.id,skuSnapshot:item.sku}];
 const sold=postIssuedInvoiceStock(vault,invoice);
 assert.equal(sold.created,true);
 vault.inventoryMovements=sold.vault.inventoryMovements;
 vault.documents=[invoice];
 const controls={
  workspaceId:'default',branchId:'main',functionalCurrency:'USD',asOfDate:'2026-10-28',
  currencyMinorDigits:2,inventoryAssetAccountId:'asset:inventory',
  supplierPayableAccountId:'liability:ap',salesCogsAccountId:'expense:cogs',
  inventoryAllowanceAccountId:'contra:nrv',impairmentExpenseAccountId:'expense:nrv'
 };
 const evidence={scope:{
  workspaceId:'default',branchId:'main',
  warehouseId:defaultWarehouseId('main'),itemId:item.id,functionalCurrency:'USD'},
  orderedMovementIds:vault.inventoryMovements.map(m=>m.id),
  movements:vault.inventoryMovements,purchases:vault.purchases,documents:vault.documents};
 const journals=vault.inventoryMovements.map((movement,index)=>{
  const purchase=index===0,amount=purchase?'10.00':'5.00';
  return{id:'QA-gl-'+index,sourceKind:purchase?'purchase-receipt':'sales-stock-issue',
   sourceMovementId:movement.id,effectiveDate:movement.date,
   workspaceId:'default',branchId:'main',currency:'USD',
   lines:purchase?[
    {accountId:controls.inventoryAssetAccountId,direction:'debit',amount},
    {accountId:controls.supplierPayableAccountId,direction:'credit',amount}
   ]:[
    {accountId:controls.salesCogsAccountId,direction:'debit',amount},
    {accountId:controls.inventoryAssetAccountId,direction:'credit',amount}
   ]};
 });
 return{evidence:plain(evidence),controls,journals};
}
async function seed({closeThrough}={}){
 const actor={uid:'qa-gl-'+uid(),role:'owner'},root=db.collection('users').doc(actor.uid);
 const vault=emptyVault(),revision=uid();
 const encoded=encodeWorkspace(vault,revision);
 await root.collection('workspace').doc('meta').create(encoded.meta);
 for(const ch of encoded.chunks)
  await root.collection('workspace').doc('chunk-'+revision+'-'+String(ch.index).padStart(5,'0')).create(ch);
 let status=await periodService.execute(actor,{operation:'enroll',opId:uid(),
  expectedRevision:revision,expectedGeneration:0});
 if(closeThrough)status=await periodService.execute(actor,{operation:'close',opId:uid(),
  expectedRevision:status.revision,expectedGeneration:status.generation,
  workspaceId:'default',through:closeThrough,reason:'synthetic QA close'});
 const {evidence,controls,journals}=syntheticSources();
 const srcRef=root.collection('financeGlQaSources').doc(scopeKey);
 await srcRef.create({format:'LOUREX_FINANCE_GL_QA_SOURCE_V1',
  ownerUid:actor.uid,workspaceId:'default',branchId:'main',
  sourceRevision:status.revision,controls,evidence});
 // Compute from the persisted Firestore representation, not a client object.
 const persisted=(await srcRef.get()).data().evidence;
 const digest=fingerprintSyntheticFinanceSources(persisted);
 const ledgerRef=root.collection('financeGlQaLedgers').doc(scopeKey);
 await ledgerRef.create({format:'LOUREX_FINANCE_GL_QA_LEDGER_V1',
  authorityPresent:true,ownerUid:actor.uid,workspaceId:'default',branchId:'main',
  ledgerVersion:0,periodGeneration:status.generation,sourceSha256:digest,
  closedThrough:null,journals:[],receipts:[]});
 const command={scopeKey,opId:uid(),workspaceId:'default',branchId:'main',
  expectedLedgerVersion:0,expectedPeriodGeneration:status.generation,
  expectedSourceSha256:digest,append:journals};
 return{actor,root,command,ledgerRef,srcRef};
}
async function snapshot(f){
 const ledger=(await f.ledgerRef.get()).data();
 const journals=(await f.root.collection('financeGlQaJournals').get()).docs.map(x=>({id:x.id,data:x.data()}));
 const receipts=(await f.root.collection('financeGlQaReceipts').get()).docs.map(x=>({id:x.id,data:x.data()}));
 return plain({ledger,journals,receipts});
}
test('real demo Firestore transaction creates journals, operation receipt and ledger revision atomically',async()=>{
 const f=await seed(),before=await snapshot(f);
 const result=await service.execute(f.actor,f.command),after=await snapshot(f);
 assert.equal(result.emulatorCommitted,true);
 assert.equal(result.trustedPostingCommitted,false);
 assert.equal(result.productionReady,false);
 assert.equal(after.ledger.ledgerVersion,1);
 assert.equal(after.journals.length,2);
 assert.equal(after.receipts.length,1);
 assert.equal(after.ledger.journals.length,2);
 assert.equal(after.ledger.receipts.length,1);
 assert.equal(after.receipts[0].data.trialDebit,'10.00');
 assert.notDeepEqual(after,before);
 const replay=await service.execute(f.actor,f.command);
 assert.equal(replay.replayed,true);
 assert.equal(replay.emulatorCommitted,false);
 assert.deepEqual(await snapshot(f),after,'replay does not duplicate financial rows');
 await assert.rejects(service.execute(f.actor,{
  ...f.command,append:f.command.append.slice().reverse()
 }),/ALIF_22_GL_CONTRACT_OPERATION_REUSED/);
 assert.deepEqual(await snapshot(f),after);
});

test('two overlapping demo devices get one commit, one stale-revision rejection',async()=>{
 const f=await seed(),a=plain(f.command),b={...plain(f.command),opId:uid()};
 const attempts=await Promise.allSettled([
  service.execute(f.actor,a),service.execute(f.actor,b)
 ]);
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(attempts.filter(x=>x.status==='rejected').length,1);
 assert.match(attempts.find(x=>x.status==='rejected').reason.message,/REVISION_CONFLICT/);
 const after=await snapshot(f);
 assert.equal(after.ledger.ledgerVersion,1);
 assert.equal(after.journals.length,2);
 assert.equal(after.receipts.length,1);
});

test('original period close rejects dated postings without altering any record',async()=>{
 const f=await seed({closeThrough:'2026-10-19'}),before=await snapshot(f);
 await assert.rejects(service.execute(f.actor,f.command),
  /ALIF_22_GL_CONTRACT_CLOSED_OR_INVALID_PERIOD/);
 assert.deepEqual(await snapshot(f),before);
});

test('missing control, wrong owner, and a changed generation reject without replay',async()=>{
 const f=await seed(),result=await service.execute(f.actor,f.command);
 assert.equal(result.emulatorCommitted,true);
 const before=await snapshot(f);
 await assert.rejects(service.execute({...f.actor,uid:'qa-unrelated-'+uid()},f.command),
  /TRUSTED_PERIOD_AUTHORITY_MISSING/);
 await assert.rejects(service.execute({...f.actor,role:'finance'},f.command),
  /QA_OWNER_REQUIRED/);
 await f.root.collection('accounting').doc('control').delete();
 await assert.rejects(service.execute(f.actor,f.command),/TRUSTED_PERIOD_AUTHORITY_MISSING/);
 assert.deepEqual(await snapshot(f),before);
});

test('changed server-side source value and corrupted journal records cannot replay success',async()=>{
 const a=await seed(),committed=await service.execute(a.actor,a.command);
 assert.equal(committed.emulatorCommitted,true);
 const old=await snapshot(a),sourced=(await a.srcRef.get()).data();
 const changed=plain(sourced);changed.evidence.movements[0].unitCost='900.00';
 await a.srcRef.set(changed);
 await assert.rejects(service.execute(a.actor,a.command),/SOURCE_CHANGED/);
 assert.deepEqual(await snapshot(a),old);
 const b=await seed();await service.execute(b.actor,b.command);
 const oldB=await snapshot(b),journalRef=b.root.collection('financeGlQaJournals').doc('QA-gl-0');
 const corrupted=plain((await journalRef.get()).data());
 corrupted.lines[0].amount='900.00';
 await journalRef.set(corrupted);
 await assert.rejects(service.execute(b.actor,b.command),/JOURNAL_AUTHORITY_MISSING/);
 assert.deepEqual((await b.ledgerRef.get()).data(),oldB.ledger);
 assert.equal((await b.root.collection('financeGlQaReceipts').get()).size,1);
});

test('simulated failure after all buffered writes rolls back every Firestore document',async()=>{
 const f=await seed(),before=await snapshot(f);
 const faulty=createFinanceGlQaEmulatorService(db,{abortAfterStagingWrites:true});
 await assert.rejects(faulty.execute(f.actor,f.command),/INJECTED_TRANSACTION_ABORT/);
 assert.deepEqual(await snapshot(f),before);
 const result=await service.execute(f.actor,f.command);
 assert.equal(result.emulatorCommitted,true);
 assert.equal((await f.root.collection('financeGlQaJournals').get()).size,2);
 assert.equal((await f.root.collection('financeGlQaReceipts').get()).size,1);
});

test('no source digest substitution or second account access via claimed scope',async()=>{
 const f=await seed(),before=await snapshot(f);
 await assert.rejects(service.execute(f.actor,{...f.command,expectedSourceSha256:'f'.repeat(64)}),
  /ALIF_22_GL_CONTRACT_SOURCE_VERSION_MISMATCH/);
 await assert.rejects(service.execute(f.actor,{...f.command,workspaceId:'other'}),
  /ALIF_22_GL_CONTRACT_WRONG_SCOPE/);
 assert.deepEqual(await snapshot(f),before);
});

test.after(async()=>{await deleteApp(app);});
