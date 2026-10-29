import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase} from '../dist/src/lib/operations.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {defaultWarehouseId} from '../dist/src/lib/warehouses.js';
import {inspectSourceBoundStockGl} from '../dist/src/lib/finance-source-bound-stock-gl-preview.js';
import {
  fingerprintSyntheticFinanceSources,fingerprintSyntheticFinanceControls,
  syntheticFinanceGlScopeKey,prototypeFinanceGlAtomicAppend
} from '../api/_accounting/finance-gl-atomic-contract.js';

const controls={workspaceId:'default',branchId:'main',functionalCurrency:'USD',
  asOfDate:'2026-10-27',currencyMinorDigits:2,
  inventoryAssetAccountId:'asset:stock',supplierPayableAccountId:'liability:ap',
  salesCogsAccountId:'expense:cogs',inventoryAllowanceAccountId:'contra:nrv',
  impairmentExpenseAccountId:'expense:impairment'};
const identity={uid:'qa-owner',role:'owner'};
function fixture(){
 const vault=emptyVault(),supplier={...createSupplier(),id:'QA-vendor',nameEn:'QA Vendor'};
 const item={id:'QA-stock',sku:'QA-SKU',descriptionEn:'Carton',descriptionAr:'',
  unit:'Carton',createdAt:'2026-10-18T00:00:00Z',updatedAt:'2026-10-18T00:00:00Z',
  inventoryTracking:'tracked',workspaceId:'default',branchId:'main',
  lastUnitCost:'',lastCostCurrency:'',lastUnitPrice:'8',lastCurrency:'USD'};
 vault.savedItems=[item];vault.suppliers=[supplier];
 const purchase=createPurchase([],vault.suppliers,'USD');
 Object.assign(purchase,{id:'QA-purchase',number:'PUR-QA',date:'2026-10-19',
  dueDate:'2026-10-19',workspaceId:'default',branchId:'main',currency:'USD',
  freight:'0.00',duty:'0.00',otherCosts:'0.00'});
 purchase.items=[{...createPurchaseItem(item),id:'QA-line',quantity:'2',unitCost:'5'}];
 const bought=postPurchase(purchase,vault.savedItems,vault.inventoryMovements);
 vault.purchases=[{...bought.purchase,workspaceId:'default',branchId:'main'}];
 vault.inventoryMovements=bought.movements.map(m=>({...m,workspaceId:'default',branchId:'main'}));
 vault.savedItems=bought.savedItems;
 const invoice=createBlankDocument('invoice','INV-QA',vault.company);
 Object.assign(invoice,{id:'QA-invoice',number:'INV-QA',currency:'USD',
  status:'final',role:'standard',issueDate:'2026-10-22',
  dueDate:'2026-10-22',workspaceId:'default',branchId:'main'});
 invoice.customerSnapshot={sourceCustomerId:'QA-customer',companyNameEn:'QA buyer',
  companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
  phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
 invoice.items=[{...invoice.items[0],id:'QA-invoice-line',descriptionEn:'Carton',unit:'Carton',
  quantity:'1',unitPrice:'8',unitCost:'5',stockTreatment:'tracked',
  savedItemId:item.id,skuSnapshot:item.sku}];
 const posted=postIssuedInvoiceStock(vault,invoice);
 assert.equal(posted.created,true);
 vault.inventoryMovements=posted.vault.inventoryMovements;vault.documents=[invoice];
 const sourceEvidence={
  scope:{workspaceId:'default',branchId:'main',warehouseId:defaultWarehouseId('main'),
    itemId:item.id,functionalCurrency:'USD'},
  orderedMovementIds:vault.inventoryMovements.map(m=>m.id),
  movements:vault.inventoryMovements,purchases:vault.purchases,documents:vault.documents
 };
 const append=vault.inventoryMovements.map((m,i)=>({
  id:'QA-journal-'+i,sourceKind:i===0?'purchase-receipt':'sales-stock-issue',
  sourceMovementId:m.id,effectiveDate:m.date,workspaceId:'default',branchId:'main',
  currency:'USD',lines:i===0?[
   {accountId:controls.inventoryAssetAccountId,direction:'debit',amount:'10.00'},
   {accountId:controls.supplierPayableAccountId,direction:'credit',amount:'10.00'}
  ]:[
   {accountId:controls.salesCogsAccountId,direction:'debit',amount:'5.00'},
   {accountId:controls.inventoryAssetAccountId,direction:'credit',amount:'5.00'}
  ]
 }));
 const state={authorityPresent:true,ownerUid:'qa-owner',
  workspaceId:'default',branchId:'main',periodGeneration:7,ledgerVersion:0,
  closedThrough:null,sourceSha256:fingerprintSyntheticFinanceSources(sourceEvidence),
  controlsSha256:fingerprintSyntheticFinanceControls(controls),
  journals:[],receipts:[]};
 const command={opId:'qa-op-1',workspaceId:'default',branchId:'main',
  expectedLedgerVersion:0,expectedPeriodGeneration:7,
  expectedSourceSha256:state.sourceSha256,append};
 return{state,identity,command,sourceEvidence,controls,verifySourceBoundGl:inspectSourceBoundStockGl};
}
const run=x=>prototypeFinanceGlAtomicAppend(x);
const refused=(x,reason)=>assert.throws(()=>run(x),new RegExp('ALIF_22_GL_CONTRACT_'+reason));

test('atomic rehearsal: source-verified purchase and sale produce an unposted, immutable candidate',()=>{
 const s=fixture(),before=JSON.stringify(s),result=run(s);
 assert.equal(result.replayed,false);
 assert.equal(result.state.ledgerVersion,1);
 assert.equal(result.state.journals.length,2);
 assert.equal(result.receipt.trialDebit,'10.00');
 assert.equal(result.receipt.trialCredit,'10.00');
 assert.equal(result.state.receipts[0].fingerprint.length,64);
 assert.equal(result.trustedPostingCommitted,false);
 assert.equal(result.productionReady,false);
 assert.equal(JSON.stringify(s),before);
 result.state.journals[0].lines[0].amount='999.00';
 assert.equal(s.command.append[0].lines[0].amount,'10.00','accepted candidate is deep-copied');
});

test('same operation and exact payload replay exactly one receipt without duplicate journal',()=>{
 const s=fixture(),first=run(s);
 const replay=run({...s,state:first.state});
 assert.equal(replay.replayed,true);
 assert.equal(replay.state,first.state);
 assert.deepEqual(replay.receipt,first.receipt);
 assert.equal(replay.state.journals.length,2);
});

test('reused opId with changed monetary amount, identity or generation fails closed',()=>{
 const s=fixture(),first=run(s);
 for(const change of [
  v=>v.command.append[1].lines[0].amount='6.00',
  v=>v.command.expectedPeriodGeneration=8,
  v=>v.command.append[1].sourceMovementId='other-source'
 ]){
  const x={...s,state:structuredClone(first.state),command:structuredClone(s.command)};
  change(x);
  refused(x,'OPERATION_REUSED');
 }
});

test('two simulated devices cannot both commit against the same ledger revision',()=>{
 const s=fixture(),first=run(s);
 const second={...s,state:first.state,command:{...structuredClone(s.command),opId:'qa-op-2'}};
 refused(second,'REVISION_CONFLICT');
 assert.equal(second.state.journals.length,2);
 assert.equal(second.state.receipts.length,1);
});

test('identity and missing period authority are checked before duplicate replay',()=>{
 const s=fixture(),first=run(s);
 refused({...s,identity:{uid:'QA-stranger',role:'owner'}},'OWNER_REQUIRED');
 refused({...s,identity:{uid:'qa-owner',role:'finance'}},'OWNER_REQUIRED');
 refused({...s,state:{...first.state,authorityPresent:false}},'AUTHORITY_MISSING');
 refused({...s,state:{...first.state,periodGeneration:0}},'AUTHORITY_MISSING');
});

test('period-lock cutoff refuses even balanced synthetic historical GL proposals',()=>{
 const s=fixture();
 refused({...s,state:{...s.state,closedThrough:'2026-10-19'}},'CLOSED_OR_INVALID_PERIOD');
 refused({...s,state:{...s.state,closedThrough:'2026-10-32'}},'PERIOD_CONTROL_INVALID');
 refused({...s,state:{...s.state,closedThrough:'2026-10-27'}},'CLOSED_OR_INVALID_PERIOD');
 assert.equal(run({...s,state:{...s.state,closedThrough:'2026-10-18'}}).state.journals.length,2);
});

test('stale source digest, forged source and changed request source hash refuse without writing',()=>{
 const s=fixture(),changed={...s,sourceEvidence:structuredClone(s.sourceEvidence)};
 changed.sourceEvidence.movements[0].unitCost='500.00';
 refused({...changed,verifySourceBoundGl:inspectSourceBoundStockGl},'SOURCE_VERSION_MISMATCH');
 refused({...s,command:{...s.command,expectedSourceSha256:'tampered'}},'SOURCE_VERSION_MISMATCH');
});

test('source WAC validator rejects balanced but inflated COGS inside full atomic proposal',()=>{
 const s=fixture();
 s.command.append[1].lines[0].amount='6.00';
 s.command.append[1].lines[1].amount='6.00';
 assert.throws(()=>run(s),/ALIF_22_SOURCE_BOUND_GL_NOT_READY/);
});

test('source history incomplete, wrong company or duplicate source rejects',()=>{
 const s=fixture();
 assert.throws(()=>run({...s,command:{...s.command,append:s.command.append.slice(0,1)}}),
  /ALIF_22_SOURCE_BOUND_GL_NOT_READY/);
 refused({...s,command:{...s.command,branchId:'other'}},'WRONG_SCOPE');
 const duplicate={...s,command:structuredClone(s.command)};
 duplicate.command.append[1].id=duplicate.command.append[0].id;
 refused({...duplicate,verifySourceBoundGl:inspectSourceBoundStockGl},'DUPLICATE_OR_MISSING_SOURCE');
});

test('command ID and generation cannot be malformed; non-owner cannot force bypass',()=>{
 const s=fixture();
 refused({...s,command:{...s.command,opId:'../escape'}},'INVALID_COMMAND');
 refused({...s,command:{...s.command,expectedPeriodGeneration:6}},'REVISION_CONFLICT');
 refused({...s,command:{...s.command,expectedLedgerVersion:1}},'REVISION_CONFLICT');
});

test('even returning synthetic audit flags cannot create production approval',()=>{
 const s=fixture(),x=run(s);
 assert.equal(x.trustedPostingCommitted,false);
 assert.equal(x.productionReady,false);
 assert.deepEqual(Object.keys(x.state.receipts[0]).sort(),
  ['opId','fingerprint','ledgerVersion','generation','sourceSha256',
   'controlsSha256','journalIds','trialDebit','trialCredit'].sort());
});


test('idempotent GL replay fails closed if a stored candidate journal changed without changing original source',()=>{
 const s=fixture(),first=run(s);
 for(const changedField of [
  state=>state.journals[1].lines.forEach(line=>line.amount='6.00'),
  state=>state.journals[1].sourceKind='purchase-receipt',
  state=>state.journals[0].effectiveDate='2026-10-20'
 ]){
  const damaged=structuredClone(first.state);changedField(damaged);
  refused({...s,state:damaged},'HISTORIC_JOURNAL_CHANGED');
  assert.equal(JSON.stringify(first.state),JSON.stringify(run(s).state),
    'bad replay must not alter known-good proposal');
 }
});

test('idempotent GL replay verifies receipt source, generation, original append IDs and approval amounts',()=>{
 const s=fixture(),first=run(s);
 const modifications=[
  x=>x.receipts[0].sourceSha256='a'.repeat(64),
  x=>x.receipts[0].generation=8,
  x=>x.receipts[0].ledgerVersion=2,
  x=>x.receipts[0].journalIds=['QA-journal-0','QA-journal-0'],
  x=>x.receipts[0].journalIds=['QA-journal-1','QA-journal-0'],
  x=>x.receipts[0].trialDebit='12.00',
  x=>{x.receipts[0].trialDebit='11.00';x.receipts[0].trialCredit='11.00';},
  x=>x.receipts=[],
  x=>x.receipts.push(structuredClone(x.receipts[0]))
 ];
 for(const mutate of modifications){
  const changed=structuredClone(first.state);mutate(changed);
  refused({...s,state:changed},'HISTORIC_RECEIPT_CORRUPT');
 }
 assert.equal(run({...s,state:first.state}).replayed,true);
});

test('relabelling the same physical source kind cannot book two synthetic journals',()=>{
 const s=fixture(),changed=structuredClone(s.command);
 changed.append[1].sourceMovementId=changed.append[0].sourceMovementId;
 changed.append[1].sourceKind='sales-stock-issue';
 refused({...s,command:changed},'DUPLICATE_OR_MISSING_SOURCE');
});

test('replay after period close remains read-only only while historic source and current authority are intact',()=>{
 const s=fixture(),posted=run(s);
 const closed={...posted.state,closedThrough:'2026-10-22'};
 const replay=run({...s,state:closed});
 assert.equal(replay.replayed,true);
 assert.equal(replay.state,closed,'closed period is not opened or mutated on replay');
 refused({...s,state:{...closed,periodGeneration:8}},'HISTORIC_RECEIPT_CORRUPT');
});


test('candidate account mappings and functional currency are pinned before exact replay',()=>{
 const s=fixture(),first=run(s);
 assert.match(first.receipt.controlsSha256,/^[a-f0-9]{64}$/);
 const altered={...s,controls:{...s.controls,
   supplierPayableAccountId:'liability:some-other-AP'}};
 refused(altered,'CONTROLS_VERSION_MISMATCH');
 refused({...altered,state:first.state},'CONTROLS_VERSION_MISMATCH');
 const currency={...s,controls:{...s.controls,functionalCurrency:'EUR'}};
 refused(currency,'CONTROLS_VERSION_MISMATCH');
 const corrupt=structuredClone(first.state);
 corrupt.receipts[0].controlsSha256='a'.repeat(64);
 refused({...s,state:corrupt},'HISTORIC_RECEIPT_CORRUPT');
 assert.equal(run({...s,state:first.state}).replayed,true);
});

test('canonical scope key uses unambiguous two-component namespace and refuses omitted company or branch',()=>{
 assert.match(syntheticFinanceGlScopeKey('default','main'),/^scope-[a-f0-9]{48}$/);
 assert.equal(syntheticFinanceGlScopeKey('default','main'),
  syntheticFinanceGlScopeKey('default','main'));
 assert.notEqual(syntheticFinanceGlScopeKey('qa-one','main'),
  syntheticFinanceGlScopeKey('qa','one-main'));
 assert.throws(()=>syntheticFinanceGlScopeKey('','main'),/INVALID_SCOPE_ID/);
 assert.throws(()=>syntheticFinanceGlScopeKey('main',''),/INVALID_SCOPE_ID/);
});
