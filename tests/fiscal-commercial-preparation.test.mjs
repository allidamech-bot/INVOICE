import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {FIRST_PREVIOUS_INVOICE_HASH} from '../dist/src/lib/fiscal-issuance.js';
import {createFiscalLedger} from '../api/_fiscal/ledger.js';
import {mapCommercialFiscalInvoice} from '../api/_fiscal/commercial-invoice.js';
import {createCommercialFiscalPreparation} from '../api/_fiscal/commercial-preparation.js';
import {createCommercialIssueApproval} from '../api/_fiscal/commercial-approval.js';
import {createCommercialReview} from '../api/_fiscal/commercial-review.js';
import {reviewDigest} from '../api/_fiscal/commercial-source.js';
import {advanceCashFacts,reserveAdvanceCash,planAdvanceRefundCommercial} from '../api/_fiscal/advance-commercial.js';
import {resolveFiscalCreditOriginal,planFiscalCreditReservation} from '../api/_fiscal/commercial-credit.js';
import {resolveCommercialScenario,planCommercialScenario} from '../api/_fiscal/commercial-scenarios.js';
import {createAcceptedFiscalReader} from '../api/_fiscal/accepted-issue.js';
import {createFiscalSimulationWorker} from '../api/_fiscal/simulation-worker.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {encodeWorkspace} from '../api/_accounting/period-format.js';
const scope={accountUid:'owner',workspaceId:'company',egsId:'egs',environment:'simulation'},id='doc';
const base='fiscalPrivateV1/owner/workspaces/company',at='2026-11-18T10:00:00.000Z';
const seller={country:'SA',vatNumber:'300000000000003',crn:'1000000000',building:'1234',postal:'12345',street:'شارع',district:'حي',city:'الرياض',name:'شركة اختبار'};
const buyer={...seller,vatNumber:'311111111111113',crn:'1111111111',name:'عميل اختبار'};
const issuer={...scope,legalName:seller.name,vatNumber:seller.vatNumber,issuerCountry:'SA',saRegime:'phase-2',profileVersion:1,effectiveFrom:'2026-01-01'};
const document={id,workspaceId:scope.workspaceId,branchId:'main',revision:1,kind:'invoice',role:'standard',status:'draft',lifecycleStatus:'active',currency:'SAR',number:'INV-1',issueDate:'2026-11-18',companySnapshot:{nameAr:seller.name,vatNumber:seller.vatNumber,commercialRegistration:seller.crn,city:seller.city,country:'SA'},customerSnapshot:{companyNameAr:buyer.name,vatTaxNumber:buyer.vatNumber,commercialRegistration:buyer.crn,city:buyer.city,country:'SA'},items:[{id:'line',descriptionAr:'منتج',unit:'PCS',quantity:'2',unitPrice:'100'}],adjustments:{discountEnabled:true,discountMode:'percent',discountValue:'10',shippingEnabled:true,shipping:'15',otherChargesEnabled:false,taxEnabled:true,taxPercent:'15'}};
const review={...scope,branchId:'main',documentRevision:1,sourceDocumentId:id,invoiceType:'standard',seller,buyer,taxCategory:'S',taxRate:'15',supplyDate:'2026-11-18',paymentMeans:'30'};
const identity={documentId:id,uuid:'11111111-1111-4111-8111-111111111111',icv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH,generatedAt:at};
const payload={document,issuer,review,generatedAt:at};
const map=(d=document,r=review,i=issuer)=>mapCommercialFiscalInvoice({scope,document:d,review:r,issuer:i,identity});
const digest=b=>createHash('sha256').update(b).digest('hex');
function fixture({publish=true,treasuryEntries=[],treasuryAccounts=[]}={}){
 let rows=new Map(),tail=Promise.resolve();
 const db={doc:path=>({path}),runTransaction(fn){const job=tail.then(async()=>{const staged=new Map(structuredClone([...rows]));let writing=false;const tx={async get(ref){assert.equal(writing,false,'read before write');return {exists:staged.has(ref.path),data:()=>structuredClone(staged.get(ref.path))};},create(ref,v){writing=true;assert.equal(staged.has(ref.path),false);staged.set(ref.path,structuredClone(v));},update(ref,v){writing=true;assert.ok(staged.has(ref.path));staged.set(ref.path,{...staged.get(ref.path),...structuredClone(v)});}};const r=await fn(tx);rows=staged;return r;});tail=job.catch(()=>{});return job;}};
 const put=(p,v)=>rows.set(p,structuredClone(v));
 put(base,{...scope,syntheticOnly:true});put(base+'/egs/egs',{...scope,active:true,nextIcv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH});
 const root='users/owner',manifest=root+'/workspace/meta',control=root+'/accounting/control',reviewPath=base+'/issueReviews/doc',intentPath=base+'/issueIntents/doc';
 const revision='a'.repeat(32);
 function source(p=payload,extraDocuments=[]){
   const v=emptyVault();v.documents=[p.document,...extraDocuments];v.treasuryEntries=structuredClone(treasuryEntries);v.treasuryAccounts=structuredClone(treasuryAccounts);v.workspaces[0].id=scope.workspaceId;v.branches[0].workspaceId=scope.workspaceId;
   const encoded=encodeWorkspace(v,revision);const meta={...encoded.meta,chunkStorage:'period-generations-v1'};
   put(manifest,meta);put(control,{format:'LOUREX_PERIOD_CONTROL_V1',version:1,ownerUid:scope.accountUid,generation:1,boundaries:[]});
   for(const chunk of encoded.chunks)put(root+'/periodGenerations/'+revision+'/chunks/chunk-'+revision+'-'+String(chunk.index).padStart(5,'0'),chunk);
   const verified={...scope,documentId:p.document.id,state:'approved',sourceRevision:revision,sourceSha256:meta.sha256,periodGeneration:1,documentRevision:p.document.revision,issuer:p.issuer,review:p.review};
   put(base+'/issueReviews/'+p.document.id,verified);
   return {revision,sha256:meta.sha256,generation:1,reviewDigest:reviewDigest(verified)};
 }
 function intent(p=payload,extraDocuments=[]){const binding=source(p,extraDocuments);const bytes=Buffer.from(JSON.stringify({...p,source:binding}));put(base+'/issueIntents/'+p.document.id,{...scope,documentId:p.document.id,state:'approved',generatedAt:p.generatedAt,documentRevision:p.document.revision,sha256:digest(bytes),bytes:bytes.toString('base64')});}
 if(publish)intent();else source();
 const ledger=createFiscalLedger(db);
 const make=(patch={})=>createCommercialFiscalPreparation({db,ledger,canonicalize:b=>b,validateOfficial:async()=>true,clock:()=>at,uuid:()=>identity.uuid,...patch});
 const approve=createCommercialIssueApproval({db,clock:()=>at});
 return {db,ledger,make,put,intent,source,approve,manifest,control,reviewPath,intentPath,read:p=>rows.get(p)};
}
test('existing LOUREX invoice maps into one UBL candidate with identical discount freight VAT and total',()=>{
 const m=map();assert.equal(m.mode,'clearance');assert.equal(m.commercial.subtotal,'200.00');assert.equal(m.commercial.discount,'20.00');assert.equal(m.commercial.shipping,'15.00');assert.equal(m.commercial.tax,'29.25');assert.equal(m.candidate.totals.taxInclusiveTotal,'224.25');assert.match(m.candidate.bytes.toString(),/224\.25/);assert.equal(m.invoice.lines[0].unitCode,'PCE');
});
test('wrong source scope, altered legal identity, final document or unsupported charging fails closed',()=>{
 for(const patch of [{workspaceId:'other'},{branchId:'other'},{status:'final'},{currency:'USD'},{role:'credit-note'},{revision:2},{items:[{...document.items[0],unit:'unknown'}]},{items:[{...document.items[0],unitPrice:'1.00001'}]},{adjustments:{...document.adjustments,otherChargesEnabled:true,otherCharges:'10'}},{adjustments:{...document.adjustments,taxPercent:'0'}}])assert.throws(()=>map({...document,...patch}));
 assert.throws(()=>map(document,{...review,buyer:{...buyer,vatNumber:seller.vatNumber}}));assert.throws(()=>map(document,review,{...issuer,saRegime:'out-of-scope'}));
 const m=map({...document,customerSnapshot:null},{...review,invoiceType:'simplified',buyer:null});assert.equal(m.mode,'reporting');
});
test('approved commercial intent composes existing UBL and real ledger; retry does not reserve another sequence',async()=>{
 const f=fixture();let calls=0;
 const prepare=f.make({validateOfficial:async({bytes,mode})=>{calls++;assert.equal(mode,'clearance');assert.match(bytes.toString(),/INV-1/);return true;}});
 const first=await prepare(scope,id),second=await prepare(scope,id);
 assert.deepEqual(first,{documentId:id,status:'queued',version:1});assert.deepEqual(second,first);assert.equal(calls,1);
 assert.equal(f.read(base+'/egs/egs').nextIcv,'2');assert.equal(f.read(base+'/outbox/doc').state,'ready');
 assert.equal(f.read(base+'/issues/doc').snapshotDigest,f.read(base+'/issueIntents/doc').sha256);
});
test('no sequence reservation on unavailable SDK, unapproved intent or revision change during validation',async()=>{
 for(const outcome of [false,undefined]){const f=fixture();await assert.rejects(f.make({validateOfficial:async()=>outcome})(scope,id),/OFFICIAL_VALIDATION_REQUIRED/);assert.equal(f.read(base+'/egs/egs').nextIcv,'1');assert.equal(f.read(base+'/issues/doc'),undefined);}
 const f=fixture();await assert.rejects(f.make({validateOfficial:async()=>{f.intent({...payload,document:{...document,revision:2}});return true;}})(scope,id),/APPROVED_INTENT_CHANGED/);
 assert.equal(f.read(base+'/egs/egs').nextIcv,'1');
 const g=fixture();g.put(base+'/issueIntents/doc',{...g.read(base+'/issueIntents/doc'),state:'draft'});await assert.rejects(g.make()(scope,id));
 await assert.rejects(g.make()({...scope,environment:'production'},id));
});
test('simplified source cannot be queued without protected signing session',async()=>{
 const f=fixture();f.intent({...payload,document:{...document,customerSnapshot:null},review:{...review,invoiceType:'simplified',buyer:null}});
 await assert.rejects(f.make()(scope,id),/SIGNING_NOT_CONFIGURED/);assert.equal(f.read(base+'/egs/egs').nextIcv,'1');
});

const owner={uid:'owner',role:'owner'},command={workspaceId:'company',egsId:'egs',documentId:'doc'};
test('approval reads the existing immutable LOUREX workspace, freezes reviewed draft, then prepares the same invoice',async()=>{
 const f=fixture({publish:false});
 const first=await f.approve(owner,command);assert.deepEqual(first,{documentId:id,status:'approved',documentRevision:1});
 assert.deepEqual(await f.approve(owner,command),first);
 const frozen=JSON.parse(Buffer.from(f.read(f.intentPath).bytes,'base64'));
 assert.deepEqual(frozen.document,document);assert.equal(frozen.source.sha256,f.read(f.manifest).sha256);
 assert.equal((await f.make()(scope,id)).status,'queued');
});
test('approval refuses injected amounts, wrong account, missing review and corrupt immutable generation',async()=>{
 const f=fixture({publish:false});
 await assert.rejects(f.approve(owner,{...command,total:1}));
 await assert.rejects(f.approve({...owner,role:'viewer'},command));
 await assert.rejects(f.approve({...owner,uid:'someone'},command));
 const verified=f.read(f.reviewPath);f.put(f.reviewPath,{...verified,state:'pending'});await assert.rejects(f.approve(owner,command),/REVIEW_REQUIRED/);
 f.put(f.reviewPath,verified);
 const rev=f.read(f.manifest).revision;
 const chunk='users/owner/periodGenerations/'+rev+'/chunks/chunk-'+rev+'-00000';
 f.put(chunk,{...f.read(chunk),data:'e30='});await assert.rejects(f.approve(owner,command));
 assert.equal(f.read(f.intentPath),undefined);
});
test('closed period or changed authoritative source blocks approval and atomic queue publication',async()=>{
 const f=fixture({publish:false});const control=f.read(f.control);
 const boundary={workspaceId:'company',through:'2026-11-18',reportId:'b'.repeat(32)};
 f.put(f.control,{...control,boundaries:[boundary]});await assert.rejects(f.approve(owner,command),/PERIOD_CLOSED/);
 f.put(f.control,control);await f.approve(owner,command);
 await assert.rejects(f.make({validateOfficial:async()=>{f.put(f.control,{...control,generation:2,boundaries:[boundary]});return true;}})(scope,id),/REVIEW_REQUIRED|SOURCE_CHANGED|PERIOD_CLOSED/);
 assert.equal(f.read(base+'/egs/egs').nextIcv,'1');assert.equal(f.read(base+'/issues/doc'),undefined);
});

test('owner review uses approved statutory party profiles and protected published draft, then freezes and queues exactly that version',async()=>{
 const f=fixture({publish:false}),draft={...document,companySnapshot:{...document.companySnapshot,addressAr:'عنوان الشركة'},customerSnapshot:{...document.customerSnapshot,sourceCustomerId:'customer',addressAr:'عنوان العميل'}};
 f.source({...payload,document:draft});f.put(base,{...scope,syntheticOnly:true,commandsEnabled:true,selectedEgsId:'egs'});
 f.put(base+'/egs/egs',{...f.read(base+'/egs/egs'),issuerVat:issuer.vatNumber,operationalCredentialRef:'operational-ref'});
 f.put(base+'/egs/egs/enrollment/approved',{...scope,state:'approved',issuer});
 f.put(base+'/sellerProfile/current',{...scope,state:'approved',party:seller,sourceAddress:'عنوان الشركة'});
 f.put(base+'/buyerProfiles/customer',{...scope,state:'approved',customerId:'customer',party:buyer,sourceAddress:'عنوان العميل',allowedInvoiceTypes:['standard']});
 f.put(f.reviewPath,{...f.read(f.reviewPath),state:'pending'});
 const run=createCommercialReview({db:f.db,clock:()=>at}),request={...command,documentRevision:1,invoiceType:'standard',supplyDate:'2026-11-18',paymentMeans:'30'};
 await assert.rejects(run(owner,{...request,invoiceType:'simplified'}));
 await assert.rejects(run(owner,{...request,documentRevision:2}));
 assert.deepEqual(await run(owner,request),{documentId:id,documentRevision:1,status:'reviewed'});
 assert.equal(f.read(f.reviewPath).review.seller.vatNumber,seller.vatNumber);
 await f.approve(owner,command,{expectedDocumentRevision:1,requireCommandEnabled:true});
 await assert.rejects(run(owner,{...request,paymentMeans:'10'}),/APPROVAL_ALREADY_BOUND/);
 assert.equal((await f.make()(scope,id)).status,'queued');
});
test('canonical review fingerprint is independent of Firestore map key iteration order',()=>assert.equal(reviewDigest({a:1,b:{c:2,d:3}}),reviewDigest({b:{d:3,c:2},a:1})));
test('approved zero-rated, exempt and out-of-scope domestic classifications preserve commercial totals without inferring eligibility',()=>{
 const d={...document,adjustments:{...document.adjustments,taxEnabled:false,taxPercent:'0'}};
 for(const [category,reasonCode,reasonText] of [['Z','VATEX-SA-35','Qualifying medicine'],['E','VATEX-SA-29','Exempt financial service'],['O','VATEX-SA-OOS','Out of scope']]){
   const r={...review,taxCategory:category,taxRate:'0',reasonCode,reasonText,classificationDigest:'a'.repeat(64)};
   const result=map(d,r);
   assert.equal(result.commercial.tax,'0.00');assert.equal(result.candidate.totals.taxInclusiveTotal,'195.00');
   assert.match(result.candidate.bytes.toString(),new RegExp(reasonCode));
   assert.throws(()=>map(d,{...r,classificationDigest:undefined}));
   assert.throws(()=>map(document,r));
 }
 assert.throws(()=>map(d));
});
test('credit references are resolved from accepted immutable original and pending credits atomically reserve net, VAT and gross',async()=>{
 const f=fixture();await f.make()(scope,id);
 const raw={clearanceStatus:'CLEARED',clearedInvoice:Buffer.from('<cleared/>').toString('base64'),validationResults:{status:'PASS',errorMessages:[],warningMessages:[]}};
 const worker=createFiscalSimulationWorker({ledger:f.ledger,resolveCredential:async()=>({...scope,kind:'production',binarySecurityToken:Buffer.from('synthetic').toString('base64'),secret:'synthetic'}),verifyPrepared:async()=>true,verifyAuthorityResult:async()=>true,clock:()=>at,attemptId:()=> 'attempt',fetchImpl:async()=>new Response(JSON.stringify(raw),{status:200})});
 assert.equal((await worker(scope,id,1)).status,'cleared');
 const correction=(note)=>({...document,id:note,number:'CN-'+note,role:'credit-note',creditForId:id,creditForNumber:document.number,items:[{...document.items[0],unit:'Unit',quantity:'1',unitPrice:'100'}],adjustments:{...document.adjustments,discountEnabled:false,shippingEnabled:false}});
 const draft=correction('note-one'),original=await f.db.runTransaction(tx=>resolveFiscalCreditOriginal(f.db,tx,scope,draft));
 assert.equal(original.original.uuid,identity.uuid);assert.deepEqual(original.originalTotals,{net:'195.00',vat:'29.25',gross:'224.25'});
 const creditReview={...review,...original,sourceDocumentId:draft.id,correctionReason:'Returned goods'};
 const nextIdentity={...identity,documentId:draft.id,uuid:'22222222-2222-4222-8222-222222222222',icv:'2',previousInvoiceHash:f.read(base+'/egs/egs').previousInvoiceHash};
 const m=mapCommercialFiscalInvoice({scope,document:draft,issuer,review:creditReview,identity:nextIdentity});assert.equal(m.invoice.kind,'credit-note');assert.match(m.candidate.bytes.toString(),/381<\/cbc:InvoiceTypeCode>/);
 const reserve=(d,n)=>f.db.runTransaction(async tx=>{const plan=await planFiscalCreditReservation(f.db,tx,scope,{document:d,issuer,review:{...creditReview,sourceDocumentId:d.id}},{...nextIdentity,documentId:d.id,uuid:n,snapshotDigest:'a'.repeat(64)});plan.write(tx);});
 const results=await Promise.allSettled([reserve(draft,nextIdentity.uuid),reserve(correction('note-two'),'33333333-3333-4333-8333-333333333333')]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected').length,1);
 assert.deepEqual(f.read(base+'/creditBalances/doc').reserved,{net:'100.00',vat:'15.00',gross:'115.00'});
 await assert.rejects(f.db.runTransaction(tx=>resolveFiscalCreditOriginal(f.db,tx,scope,{...draft,creditForNumber:'unrelated'})));
});

test('standard foreign currency and export use independently approved context and source buyer identity',()=>{
 const rate={currency:'USD',sarPerUnit:'3.75',taxDueDate:'2026-11-18',rateDate:'2026-11-18',source:'SAMA',evidenceDigest:'a'.repeat(64)};
 const foreign={...document,currency:'USD'};
 const mapped=map(foreign,{...review,fiscalContext:{rate}});
 assert.equal(mapped.invoice.currency,'USD');assert.equal(mapped.candidate.fiscalContext.vatSar,'109.69');
 assert.throws(()=>map(foreign));assert.throws(()=>map(foreign,{...review,fiscalContext:{rate:{...rate,source:'browser'}}}));
 assert.throws(()=>map(foreign,{...review,invoiceType:'simplified',fiscalContext:{rate}}));
 const exportDoc={...foreign,customerSnapshot:{...document.customerSnapshot,country:'TR',vatTaxNumber:'1234567890'},adjustments:{...document.adjustments,taxEnabled:false,taxPercent:'0'}};
 const exportBuyer={country:'TR',otherId:'1234567890',otherIdScheme:'TIN',street:'Street',city:buyer.city,name:buyer.name};
 const exported={...review,buyer:exportBuyer,taxCategory:'Z',taxRate:'0',reasonCode:'VATEX-SA-32',reasonText:'Export of goods',classificationDigest:'b'.repeat(64),fiscalContext:{rate,exportClassification:{kind:'goods',buyerCountry:'TR',evidenceDigest:'c'.repeat(64)}}};
 const x=map(exportDoc,exported);assert.equal(x.candidate.fiscalContext.vatSar,'0.00');assert.equal(x.candidate.totals.taxInclusiveTotal,'195.00');assert.match(x.candidate.bytes.toString(),/name="0100100"/);
 assert.throws(()=>map(exportDoc,{...exported,fiscalContext:{rate}}));
 assert.throws(()=>map(exportDoc,{...exported,buyer:{...exportBuyer,otherId:'other'}}));
});

function specialDraft(docId,number,amount='100'){
 return {...document,id:docId,number,customerSnapshot:{...document.customerSnapshot,sourceCustomerId:'customer'},items:[{...document.items[0],quantity:'1',unitPrice:amount}],adjustments:{...document.adjustments,discountEnabled:false,shippingEnabled:false}};
}
const specialReview=d=>({...review,sourceDocumentId:d.id,supplyDate:d.issueDate});
async function acceptOriginal(f){
 const worker=createFiscalSimulationWorker({ledger:f.ledger,resolveCredential:async()=>({...scope,kind:'production',binarySecurityToken:Buffer.from('synthetic').toString('base64'),secret:'synthetic'}),verifyPrepared:async()=>true,verifyAuthorityResult:async()=>true,clock:()=>at,attemptId:()=> 'attempt',fetchImpl:async()=>new Response(JSON.stringify({clearanceStatus:'CLEARED',clearedInvoice:Buffer.from('<cleared/>').toString('base64'),validationResults:{status:'PASS',errorMessages:[],warningMessages:[]}}),{status:200})});
 await f.make()(scope,id);assert.equal((await worker(scope,id,1)).status,'cleared');
}
function evidence(f,d,kind,hash,gross,extra={}){
 f.put(base+'/scenarioEvidence/'+hash,{...scope,state:'approved',kind,documentId:d.id,documentRevision:d.revision,evidenceDigest:hash,currency:'SAR',customerId:'customer',gross,...extra});
}
function scenarioIssue(f,d,uuid){
 return {...identity,documentId:d.id,uuid,icv:f.read(base+'/egs/egs').nextIcv,previousInvoiceHash:f.read(base+'/egs/egs').previousInvoiceHash,generatedAt:'2026-11-18T10:01:00.000Z',snapshotDigest:'d'.repeat(64)};
}
test('advance receipt is issued once from approved exact payment evidence; concurrent settlements cannot overspend it',async()=>{
 const draft=specialDraft(id,'ADV-1'),receipt={...draft,items:draft.items.map(l=>({...l,stockTreatment:'non-stock'}))},hash='e'.repeat(64);
 const cash={workspaceId:scope.workspaceId,branchId:'main',id:'cash-advance',date:receipt.issueDate,type:'deposit',sourceType:'manual',sourceId:'',currency:'SAR',amount:'115.00',fromAccountId:'',toAccountId:'bank',reference:'ADV-1',notes:'Verified synthetic deposit',createdAt:at,voidedAt:''};
 const bank={workspaceId:scope.workspaceId,branchId:'main',id:'bank',currency:'SAR',active:true};
 const f=fixture({publish:false,treasuryEntries:[cash],treasuryAccounts:[bank]});
 const treasuryEntryDigest=reviewDigest(advanceCashFacts(cash));
 evidence(f,receipt,'advance-receipt',hash,'115.00',{receivedAt:receipt.issueDate,treasuryEntryId:cash.id,treasuryEntryDigest});
 const rr={...specialReview(receipt),...await f.db.runTransaction(tx=>resolveCommercialScenario(f.db,tx,scope,receipt,specialReview(receipt),{kind:'advance-receipt',evidenceDigest:hash}))};
 const m=mapCommercialFiscalInvoice({scope,document:receipt,issuer,review:rr,identity});
 assert.equal(m.invoice.kind,'prepayment');assert.match(m.candidate.bytes.toString(),/386<\/cbc:InvoiceTypeCode>/);assert.equal(m.invoice.supplyDate,undefined);
 f.intent({...payload,document:receipt,review:rr});
 const reservedPath='fiscalPrivateV1/owner/advanceTreasuryReservations/'+reviewDigest(cash.id);
 const scenario=rr.scenario,next=scenarioIssue(f,receipt,identity.uuid);
 await assert.rejects(f.db.runTransaction(tx=>reserveAdvanceCash(f.db,tx,scope,receipt,{...scenario,treasuryEntryDigest:'0'.repeat(64)},next)));
 assert.equal(f.read(reservedPath),undefined);
 await acceptOriginal(f);
 assert.equal(f.read(reservedPath).treasuryEntryId,cash.id);
 assert.equal(f.read(reservedPath).cashDigest,treasuryEntryDigest);
 await assert.rejects(f.db.runTransaction(tx=>reserveAdvanceCash(f.db,tx,scope,receipt,scenario,next)),/FISCAL_ADVANCE_CASH_ALREADY_CLAIMED/);
 const claim=f.read('fiscalPrivateV1/owner/scenarioClaims/'+hash);assert.equal(claim.kind,'advance-receipt');assert.equal(claim.gross,'115.00');
 const duplicate=specialDraft('duplicate','ADV-2');await assert.rejects(f.db.runTransaction(tx=>resolveCommercialScenario(f.db,tx,scope,duplicate,specialReview(duplicate),{kind:'advance-receipt',evidenceDigest:hash})));
 async function settle(d,uuid){
   const instruction={kind:'advance-settlement',allocations:[{documentId:id,net:'60.00',vat:'9.00'}]};
   const r={...specialReview(d),...await f.db.runTransaction(tx=>resolveCommercialScenario(f.db,tx,scope,d,specialReview(d),instruction))};
   const next=scenarioIssue(f,d,uuid),mapped=mapCommercialFiscalInvoice({scope,document:d,issuer,review:r,identity:next});
   assert.equal(mapped.candidate.prepaymentContext.prepaid,'69.00');assert.equal(mapped.candidate.prepaymentContext.payable,'46.00');
   return f.db.runTransaction(async tx=>{const plan=await planCommercialScenario(f.db,tx,scope,{document:d,issuer,review:r},next);plan.write(tx);});
 }
 const results=await Promise.allSettled([settle(specialDraft('settle-1','INV-2'),'22222222-2222-4222-8222-222222222222'),settle(specialDraft('settle-2','INV-3'),'33333333-3333-4333-8333-333333333333')]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1);
 assert.deepEqual(f.read(base+'/advanceBalances/'+id).reserved,{net:'60.00',vat:'9.00'});
});
test('debit note references a real accepted original, exact approved adjustment and one evidence claim',async()=>{
 const f=fixture({publish:false}),original=specialDraft(id,'INV-1');f.intent({...payload,document:original,review:specialReview(original)});await acceptOriginal(f);
 const d=specialDraft('debit','DN-1','20'),hash='f'.repeat(64);
 evidence(f,d,'debit-note',hash,'23.00',{originalDocumentId:id,reason:'Price correction'});
 const instruction={kind:'debit-note',originalDocumentId:id,originalNumber:original.number,evidenceDigest:hash};
 const r={...specialReview(d),...await f.db.runTransaction(tx=>resolveCommercialScenario(f.db,tx,scope,d,specialReview(d),instruction))};
 const next=scenarioIssue(f,d,'22222222-2222-4222-8222-222222222222'),m=mapCommercialFiscalInvoice({scope,document:d,issuer,review:r,identity:next});
 assert.equal(m.invoice.kind,'debit-note');assert.match(m.candidate.bytes.toString(),/383<\/cbc:InvoiceTypeCode>/);
 assert.equal(m.candidate.totals.taxInclusiveTotal,'23.00');
 await assert.rejects(f.db.runTransaction(tx=>resolveCommercialScenario(f.db,tx,scope,d,specialReview(d),{...instruction,originalNumber:'foreign'})));
 const run=()=>f.db.runTransaction(async tx=>{const plan=await planCommercialScenario(f.db,tx,scope,{document:d,issuer,review:r},next);plan.write(tx);});
 await run();await assert.rejects(run(),/EVIDENCE_ALREADY_RESERVED/);
 assert.equal(f.read('fiscalPrivateV1/owner/scenarioClaims/'+hash).documentId,d.id);
});

test('isolated refund uses private withdrawal proof, shared reservation, accepted credit and one cash claim',async()=>{
 const draft=specialDraft(id,'ADV-1'),receipt={...draft,items:draft.items.map(l=>({...l,stockTreatment:'non-stock'}))},hash='e'.repeat(64);
 const cash={workspaceId:scope.workspaceId,branchId:'main',id:'cash-advance',date:receipt.issueDate,type:'deposit',sourceType:'manual',sourceId:'',currency:'SAR',amount:'115.00',fromAccountId:'',toAccountId:'bank',reference:'ADV-1',notes:'Synthetic deposit',createdAt:at,voidedAt:''};
 const out={...cash,id:'cash-refund',type:'withdrawal',amount:'46.00',fromAccountId:'bank',toAccountId:'',reference:'REFUND-1'};
 const bank={workspaceId:scope.workspaceId,branchId:'main',id:'bank',currency:'SAR',active:true};
 const f=fixture({publish:false,treasuryEntries:[cash,out],treasuryAccounts:[bank]});
 const treasuryEntryDigest=reviewDigest(advanceCashFacts(cash));
 evidence(f,receipt,'advance-receipt',hash,'115.00',{receivedAt:receipt.issueDate,treasuryEntryId:cash.id,treasuryEntryDigest});
 const rr={...specialReview(receipt),...await f.db.runTransaction(tx=>resolveCommercialScenario(f.db,tx,scope,receipt,specialReview(receipt),{kind:'advance-receipt',evidenceDigest:hash}))};
 f.intent({...payload,document:receipt,review:rr});await acceptOriginal(f);
 const accepted=await createAcceptedFiscalReader(f.db)(scope,id),binding={kind:'receipt',net:'100.00',vat:'15.00',gross:'115.00',evidenceDigest:hash,treasuryEntryId:cash.id};
 const final={...receipt,status:'final',fiscalAdvance:binding};
 const originalPosting={...scope,key:'sale-'+id,source:'sale',sourceId:id,commercialPosted:true,finalFingerprint:reviewDigest(final),advanceBinding:binding,amount:{kind:'prepayment',net:'100.00',vat:'15.00',gross:'115.00'},uuid:accepted.record.uuid,snapshotDigest:accepted.record.snapshotDigest,evidenceDigest:accepted.record.resultDigest,category:'S',rate:'15'};
 f.put(base+'/accountingEntries/sale-'+id,originalPosting);
 f.put('fiscalPrivateV1/owner/advanceTreasuryIndex/'+reviewDigest(cash.id),{...scope,documentId:id,uuid:accepted.record.uuid,evidenceDigest:hash,treasuryEntryId:cash.id,cashDigest:treasuryEntryDigest});
 const raw=specialDraft('refund','CN-1','40'),credit={...raw,role:'credit-note',creditForId:id,creditForNumber:receipt.number,items:raw.items.map(l=>({...l,stockTreatment:'non-stock'}))};
 f.source({...payload,document:credit,review:specialReview(credit)},[final]);
 const bytes=Buffer.from('synthetic refund cash proof'),proofHash=digest(bytes),cashDigest=reviewDigest(advanceCashFacts(out)),instruction={kind:'advance-refund',evidenceDigest:proofHash};
 const facts={receiptId:id,net:'40.00',vat:'6.00',creditFingerprint:reviewDigest(credit),receiptFingerprint:reviewDigest(final),treasuryEntryId:out.id,cashDigest,bytes:bytes.toString('base64')};
 evidence(f,credit,'advance-refund',proofHash,'46.00',{...facts,bytes:Buffer.from('forged').toString('base64')});
 await assert.rejects(f.db.runTransaction(tx=>resolveCommercialScenario(f.db,tx,scope,credit,specialReview(credit),instruction)));
 evidence(f,credit,'advance-refund',proofHash,'46.00',facts);
 await assert.rejects(f.db.runTransaction(tx=>resolveFiscalCreditOriginal(f.db,tx,scope,credit)));
 const reviewRefund={...specialReview(credit),...await f.db.runTransaction(tx=>resolveCommercialScenario(f.db,tx,scope,credit,specialReview(credit),instruction)),correctionReason:'Refund of unused prepayment'};
 const uuid='44444444-4444-4444-8444-444444444444',next=scenarioIssue(f,credit,uuid),mapped=mapCommercialFiscalInvoice({scope,document:credit,issuer,review:reviewRefund,identity:next});
 assert.equal(mapped.invoice.kind,'credit-note');assert.match(mapped.candidate.bytes.toString(),/381<\/cbc:InvoiceTypeCode>/);
 const p={...payload,document:credit,review:reviewRefund};
 f.intent(p,[final]);
 await f.make({uuid:()=>uuid})(scope,credit.id);
 const row=f.read(base+'/advanceBalances/'+id);
 assert.deepEqual(row.reserved,{net:'40.00',vat:'6.00'});
 assert.equal(f.read(base+'/advanceBalances/'+id+'/reservations/'+credit.id).kind,'advance-refund');
 assert.equal(f.read(base+'/creditBalances/'+id),undefined);
 const worker=createFiscalSimulationWorker({ledger:f.ledger,resolveCredential:async()=>({...scope,kind:'production',binarySecurityToken:Buffer.from('synthetic').toString('base64'),secret:'synthetic'}),verifyPrepared:async()=>true,verifyAuthorityResult:async()=>true,clock:()=>at,attemptId:()=> 'refund-attempt',fetchImpl:async()=>new Response(JSON.stringify({clearanceStatus:'CLEARED',clearedInvoice:Buffer.from('<cleared-credit/>').toString('base64'),validationResults:{status:'PASS',errorMessages:[],warningMessages:[]}}),{status:200})});
 assert.equal((await worker(scope,credit.id,1)).status,'cleared');
 const acceptedCredit=await createAcceptedFiscalReader(f.db)(scope,credit.id),source={payload:{documents:[final,credit],treasuryAccounts:[bank],treasuryEntries:[cash,out]},closedThrough:null},model={kind:'credit-note',net:'40.00',vat:'6.00',gross:'46.00'};
 const run=(historical=false)=>f.db.runTransaction(async tx=>{const plan=await planAdvanceRefundCommercial(f.db,tx,scope,source,p,acceptedCredit,mapped,model,{historical});if(!historical)plan.write(tx);return plan;});
 const plan=await run();
 assert.deepEqual(plan.lines,[{account:'customer-advances',side:'debit',amount:'40.00'},{account:'output-vat',side:'debit',amount:'6.00'},{account:'cash-bank',side:'credit',amount:'46.00'}]);
 assert.equal(plan.binding.kind,'refund');assert.equal(plan.binding.resultDigest,acceptedCredit.record.resultDigest);
 await assert.rejects(run(),/FISCAL_ADVANCE_CASH_ALREADY_CLAIMED/);
 assert.deepEqual((await run(true)).binding,plan.binding);
 assert.deepEqual(f.read(base+'/advanceBalances/'+id).reserved,{net:'40.00',vat:'6.00'});
});
