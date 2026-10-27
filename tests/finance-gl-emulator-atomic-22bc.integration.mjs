import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,generateKeyPairSync,sign} from 'node:crypto';
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
import {createFinanceGlQaEmulatorService,createFinanceGlQaVerifiedOwnerGateway} from './helpers/finance-gl-qa-firestore-adapter.mjs';

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
 return{vault,evidence:plain(evidence),controls,journals};
}
async function seed({closeThrough}={}){
 const actor={uid:'qa-gl-'+uid(),role:'owner'},root=db.collection('users').doc(actor.uid);
 const {vault,evidence,controls,journals}=syntheticSources();
 const revision=uid();
 // The real period-server generation MUST contain the exact source records.
 // A disconnected QA source collection is no longer accepted as evidence.
 const encoded=encodeWorkspace(vault,revision);
 await root.collection('workspace').doc('meta').create(encoded.meta);
 for(const ch of encoded.chunks)
  await root.collection('workspace').doc('chunk-'+revision+'-'+String(ch.index).padStart(5,'0')).create(ch);
 let status=await periodService.execute(actor,{operation:'enroll',opId:uid(),
  expectedRevision:revision,expectedGeneration:0});
 if(closeThrough)status=await periodService.execute(actor,{operation:'close',opId:uid(),
  expectedRevision:status.revision,expectedGeneration:status.generation,
  workspaceId:'default',through:closeThrough,reason:'synthetic QA close'});
 const authority=root.collection('accounting').doc('control');
 const srcRef=authority.collection('financeGlQaSources').doc(scopeKey);
 await srcRef.create({format:'LOUREX_FINANCE_GL_QA_SOURCE_V1',
  ownerUid:actor.uid,workspaceId:'default',branchId:'main',
  sourceRevision:status.revision,controls,evidence});
 // Compute from the persisted Firestore representation, not a client object.
 const persisted=(await srcRef.get()).data().evidence;
 const digest=fingerprintSyntheticFinanceSources(persisted);
 const ledgerRef=authority.collection('financeGlQaLedgers').doc(scopeKey);
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
 const control=f.root.collection('accounting').doc('control');
 const journals=(await control.collection('financeGlQaJournals').get()).docs.map(x=>({id:x.id,data:x.data()}));
 const receipts=(await control.collection('financeGlQaReceipts').get()).docs.map(x=>({id:x.id,data:x.data()}));
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
 await assert.rejects(service.execute(a.actor,a.command),/SOURCE_NOT_IN_PUBLISHED_WORKSPACE/);
 assert.deepEqual(await snapshot(a),old);
 const b=await seed();await service.execute(b.actor,b.command);
 const oldB=await snapshot(b),journalRef=b.root.collection('accounting').doc('control').collection('financeGlQaJournals').doc('QA-gl-0');
 const corrupted=plain((await journalRef.get()).data());
 corrupted.lines[0].amount='900.00';
 await journalRef.set(corrupted);
 await assert.rejects(service.execute(b.actor,b.command),/JOURNAL_AUTHORITY_MISSING/);
 assert.deepEqual((await b.ledgerRef.get()).data(),oldB.ledger);
 assert.equal((await b.root.collection('accounting').doc('control').collection('financeGlQaReceipts').get()).size,1);
});

test('simulated failure after all buffered writes rolls back every Firestore document',async()=>{
 const f=await seed(),before=await snapshot(f);
 const faulty=createFinanceGlQaEmulatorService(db,{abortAfterStagingWrites:true});
 await assert.rejects(faulty.execute(f.actor,f.command),/INJECTED_TRANSACTION_ABORT/);
 assert.deepEqual(await snapshot(f),before);
 const result=await service.execute(f.actor,f.command);
 assert.equal(result.emulatorCommitted,true);
 assert.equal((await f.root.collection('accounting').doc('control').collection('financeGlQaJournals').get()).size,2);
 assert.equal((await f.root.collection('accounting').doc('control').collection('financeGlQaReceipts').get()).size,1);
});

test('no source digest substitution or second account access via claimed scope',async()=>{
 const f=await seed(),before=await snapshot(f);
 await assert.rejects(service.execute(f.actor,{...f.command,expectedSourceSha256:'f'.repeat(64)}),
  /ALIF_22_GL_CONTRACT_SOURCE_VERSION_MISMATCH/);
 await assert.rejects(service.execute(f.actor,{...f.command,workspaceId:'other'}),
  /ALIF_22_GL_CONTRACT_WRONG_SCOPE/);
 assert.deepEqual(await snapshot(f),before);
});


test('same matching SHA cannot substitute forged purchase costs for the immutable published Vault',async()=>{
 const f=await seed(),before=await snapshot(f),source=(await f.srcRef.get()).data();
 const forged=plain(source);
 forged.evidence.movements[0].unitCost='900.00';
 // Synchronize BOTH the supplied source SHA and the stored QA ledger digest:
 // only direct comparison with the published workspace can reject this forgery.
 await f.srcRef.set(forged);
 const forgedHash=fingerprintSyntheticFinanceSources(forged.evidence);
 await f.ledgerRef.update({sourceSha256:forgedHash});
 await assert.rejects(service.execute(f.actor,{
  ...f.command,expectedSourceSha256:forgedHash
 }),/SOURCE_NOT_IN_PUBLISHED_WORKSPACE/);
 const after=await snapshot(f);
 assert.equal(after.ledger.ledgerVersion,0);
 assert.equal(after.journals.length,0);
 assert.equal(after.receipts.length,0);
 assert.equal(before.ledger.ledgerVersion,after.ledger.ledgerVersion);
});

test('corrupt original immutable period generation refuses any GL even when QA hash matches',async()=>{
 const f=await seed(),meta=(await f.root.collection('workspace').doc('meta').get()).data();
 const chunk=f.root.collection('periodGenerations').doc(meta.revision)
  .collection('chunks').doc('chunk-'+meta.revision+'-00000');
 const original=(await chunk.get()).data();
 await chunk.set({...original,data:'e30='});
 await assert.rejects(service.execute(f.actor,f.command),
  /PUBLISHED_WORKSPACE_INVALID/);
 const after=await snapshot(f);
 assert.equal(after.ledger.ledgerVersion,0);
 assert.equal(after.journals.length,0);
 assert.equal(after.receipts.length,0);
});

function firebaseOwnerQaToken(actorUid){
 const payload={sub:actorUid,user_id:actorUid,aud:PROJECT,
  iss:'https://securetoken.google.com/'+PROJECT,
  iat:1,exp:4102444800,
  firebase:{identities:{},sign_in_provider:'password'}};
 return Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'
  +Buffer.from(JSON.stringify(payload)).toString('base64url')+'.';
}
test('published repo Firestore Rules refuse owner-client writes under accounting/control QA paths',async()=>{
 const f=await seed(),token=firebaseOwnerQaToken(f.actor.uid);
 for(const path of ['financeGlQaSources/'+scopeKey,
    'financeGlQaLedgers/'+scopeKey,'financeGlQaJournals/QA-gl-0',
    'financeGlQaReceipts/'+f.command.opId]){
  const url='http://'+process.env.FIRESTORE_EMULATOR_HOST
   +'/v1/projects/'+PROJECT+'/databases/(default)/documents/users/'
   +f.actor.uid+'/accounting/control/'+path;
  const response=await fetch(url,{
   method:'PATCH',
   headers:{authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify({fields:{format:{stringValue:'FORGED_CLIENT_SOURCE'}}})
  });
  assert.equal(response.status,403,path+': rejected by Firestore Rules');
 }
 const untouched=await snapshot(f);
 assert.equal(untouched.ledger.ledgerVersion,0);
 assert.equal(untouched.journals.length,0);
 assert.equal(untouched.receipts.length,0);
});


test('signed Firebase owner identity alone can request the QA GL, without trusting client UID or role',async()=>{
 const f=await seed(),gateway=createFinanceGlQaVerifiedOwnerGateway(service);
 const previousFetch=globalThis.fetch;
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const kid='gl-qa-test-'+uid();
 const jwk={...publicKey.export({format:'jwk'}),kid,alg:'RS256',use:'sig'};
 let mockKeyFetches=0;
 globalThis.fetch=async url=>{
  assert.match(String(url),/service_accounts\\/v1\\/jwk\\/securetoken@system\\.gserviceaccount\\.com$/);
  mockKeyFetches++;
  return{ok:true,headers:new Headers({'cache-control':'max-age=300'}),
   json:async()=>({keys:[jwk]})};
 };
 function signedToken(patch={},headerPatch={}){
  const now=Math.floor(Date.now()/1000);
  const head=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid,...headerPatch})).toString('base64url');
  const payload={sub:f.actor.uid,aud:'lourex-invoice',
   iss:'https://securetoken.google.com/lourex-invoice',
   iat:now-20,auth_time:now-30,exp:now+3600,
   firebase:{sign_in_provider:'password'},...patch};
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const bytes=head+'.'+body;
  return bytes+'.'+sign('RSA-SHA256',Buffer.from(bytes),privateKey).toString('base64url');
 }
 const request=(jwt,command=f.command,other={})=>({
  method:'POST',headers:{authorization:'Bearer '+jwt},
  command,...other
 });
 const deny=(promise,code)=>assert.rejects(promise,new RegExp('ALIF_22_GL_EMULATOR_'+code));
 try{
  const jwt=signedToken(),before=await snapshot(f);
  const accepted=await gateway(request(jwt));
  assert.equal(accepted.emulatorCommitted,true);
  assert.equal(accepted.trustedPostingCommitted,false);
  assert.equal(accepted.productionReady,false);
  const after=await snapshot(f);
  assert.equal(after.ledger.ledgerVersion,1);
  assert.equal(after.journals.length,2);
  assert.equal(after.receipts.length,1);
  assert.notDeepEqual(after,before);
  const retry=await gateway(request(jwt));
  assert.equal(retry.replayed,true);
  assert.deepEqual(await snapshot(f),after,'signed retry writes nothing');

  await deny(gateway({method:'POST',headers:{},command:f.command}),'AUTH_REQUIRED');
  await deny(gateway(request(jwt,f.command,{uid:f.actor.uid,role:'owner'})),'INJECTED_REQUEST_IDENTITY');
  await deny(gateway(request(jwt,{...f.command,role:'owner'})),'COMMAND_IDENTITY_INJECTION');
  await deny(gateway(request(jwt,{...f.command,uid:'qa-another-user'})),'COMMAND_IDENTITY_INJECTION');
  await deny(gateway({...request(jwt),method:'GET'}),'METHOD_NOT_ALLOWED');
  for(const role of ['finance','admin','sales','purchasing','viewer']){
   await deny(gateway(request(signedToken({lourexAiRole:role}))), 'QA_OWNER_REQUIRED');
  }
  for(const patched of [
   {aud:'untrusted-project'}, {iss:'https://securetoken.google.com/other'},
   {exp:1}, {firebase:{sign_in_provider:'anonymous'}},
   {lourexAiRole:'owner',lourexWorkspaceUid:'another-uid'}
  ]) await deny(gateway(request(signedToken(patched))),'AUTH_INVALID');
  const validForOtherUid=signedToken({sub:'qa-other-'+uid(),lourexAiRole:'owner'});
  await assert.rejects(gateway(request(validForOtherUid)),
   /ALIF_22_GL_EMULATOR_TRUSTED_PERIOD_AUTHORITY_MISSING/);
  const tampered=signedToken();
  await deny(gateway(request(tampered.slice(0,-5)+'AAAAA')),'AUTH_INVALID');
  assert.equal(mockKeyFetches,1,'test key fetched once; no live Firebase or AI calls');
  assert.deepEqual(await snapshot(f),after,'all unauthorized requests preserve complete GL');
 }finally{globalThis.fetch=previousFetch;}
});

test.after(async()=>{await deleteApp(app);});
