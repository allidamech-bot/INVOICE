import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {FIRST_PREVIOUS_INVOICE_HASH} from '../dist/src/lib/fiscal-issuance.js';
import {createFiscalLedger} from '../api/_fiscal/ledger.js';
import {mapCommercialFiscalInvoice} from '../api/_fiscal/commercial-invoice.js';
import {createCommercialFiscalPreparation} from '../api/_fiscal/commercial-preparation.js';
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
function fixture(){
 let rows=new Map(),tail=Promise.resolve();
 const db={doc:path=>({path}),runTransaction(fn){const job=tail.then(async()=>{const staged=new Map(structuredClone([...rows]));let writing=false;const tx={async get(ref){assert.equal(writing,false,'read before write');return {exists:staged.has(ref.path),data:()=>structuredClone(staged.get(ref.path))};},create(ref,v){writing=true;assert.equal(staged.has(ref.path),false);staged.set(ref.path,structuredClone(v));},update(ref,v){writing=true;assert.ok(staged.has(ref.path));staged.set(ref.path,{...staged.get(ref.path),...structuredClone(v)});}};const r=await fn(tx);rows=staged;return r;});tail=job.catch(()=>{});return job;}};
 const put=(p,v)=>rows.set(p,structuredClone(v));
 put(base,{...scope,syntheticOnly:true});put(base+'/egs/egs',{...scope,active:true,nextIcv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH});
 function intent(p=payload){const bytes=Buffer.from(JSON.stringify(p));put(base+'/issueIntents/doc',{...scope,documentId:id,state:'approved',generatedAt:p.generatedAt,documentRevision:p.document.revision,sha256:digest(bytes),bytes:bytes.toString('base64')});}
 intent();const ledger=createFiscalLedger(db);
 const make=(patch={})=>createCommercialFiscalPreparation({db,ledger,canonicalize:b=>b,validateOfficial:async()=>true,clock:()=>at,uuid:()=>identity.uuid,...patch});
 return {ledger,make,put,intent,read:p=>rows.get(p)};
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
