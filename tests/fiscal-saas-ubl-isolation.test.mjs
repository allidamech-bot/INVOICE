import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {publishedWorkspaceLoader} from '../api/_fiscal/production-profile-runtime.js';
import {complianceSeller} from '../api/_fiscal/production-compliance-input.js';
import {buildDomesticFiscalCandidate} from '../api/_fiscal/ubl-draft.js';
import {FIRST_PREVIOUS_INVOICE_HASH} from '../dist/src/lib/fiscal-issuance.js';

// Integrated, OFFLINE use of actual LOUREX workspace identity and UBL writer.
// The samples are unsigned candidates, not official SDK validation, signed
// invoices, genuine ZATCA receipts, or production taxpayer registrations.
const uid='synthetic-saas-owner';
const mkCompany=(tag,v,crn)=>({
 nameAr:'منشأة تجريبية '+tag,vatNumber:v,commercialRegistration:crn,city:'الرياض'
});
const companyA=mkCompany('ألف','3'+'0'.repeat(13)+'3','1000000001');
const companyB=mkCompany('باء','3'+'9'.repeat(13)+'3','1000000002');
const makeBranch=(id,workspaceId,active)=>({id,workspaceId,active,nameAr:id});
const chunks={workspaces:[{id:'company-alpha',company:companyA},{id:'company-bravo',company:companyB}],
 branches:[makeBranch('branch-alpha','company-alpha',true),makeBranch('branch-bravo','company-bravo',true),makeBranch('old-alpha','company-alpha',false)],
 documents:[{id:'doc-alpha',workspaceId:'company-alpha'},{id:'doc-bravo',workspaceId:'company-bravo'}]};
const revision='synthetic-rev';
const meta={chunkStorage:'period-generations-v1',revision,chunkCount:1,sha256:'a'.repeat(64)};
const control={format:'LOUREX_PERIOD_CONTROL_V1',version:1,ownerUid:uid,generation:1};
const record=v=>({exists:true,data:()=>v});
const db={doc:p=>p};
const tx={get:async p=>{
 if(p==='users/'+uid+'/workspace/meta')return record(meta);
 if(p==='users/'+uid+'/accounting/control')return record(control);
 if(p==='users/'+uid+'/periodGenerations/'+revision+'/chunks/chunk-'+revision+'-00000')return record({data:'opaque'});
 return {exists:false};
}};
const format={
 validateMeta:v=>assert.equal(v,meta),
 decodeWorkspace:(m,c)=>{assert.equal(m,meta);assert.equal(c.length,1);return chunks;}
};
const load=publishedWorkspaceLoader(db,format,{includeDocuments:true});
const details={sellerIdScheme:'CRN',street:'شارع اختبار',district:'حي اختبار',buildingNumber:'1234',postalCode:'12345'};
const profile={version:7,details};
const unitFor=company=>({profileVersion:7,issuer:{vatNumber:company.vatNumber,legalName:company.nameAr}});
const makeUuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const xmlDigest=b=>createHash('sha256').update(b).digest('hex');
const buyerVat='3'+'1'.repeat(13)+'3';
function buyerFor(code){
 return {country:'SA',vatNumber:buyerVat,crn:'1000000009',
   building:'1234',postal:'12345',street:'شارع المشتري',district:'حي المشتري',city:'الرياض',name:'مشتري تجريبي '+code};
}
function buildSix(seller,tag,start){
 const output=[];
 for(const [modeIndex,mode] of ['standard','simplified'].entries()){
  for(const [kindIndex,kind] of ['invoice','credit-note','debit-note'].entries()){
   const number=start+modeIndex*3+kindIndex,uuid=makeUuid(number);
   const buyer=mode==='standard'?buyerFor(tag):null;
   const original={number:'QA-ORIGINAL-'+tag+'-'+mode,uuid:makeUuid(number+100),
     issueDate:'2026-11-20',mode,sellerVat:seller.vatNumber,buyerVat:buyer?.vatNumber??null};
   const args={currency:'SAR',mode,kind,uuid,icv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH,
     number:'QA-'+tag+'-'+mode+'-'+kind,issueDate:'2026-11-21',issueTime:'12:00:00',
     supplyDate:'2026-11-21',paymentMeans:'30',seller,buyer,
     lines:[{id:'line-'+number,name:'منتج تجريبي',quantity:'2',unitNetPrice:'50',unitCode:'PCE',category:'S',rate:'15'}],
     ...(kind==='invoice'?{}:{original,correctionReason:'تصحيح اختباري فقط'})};
   const result=buildDomesticFiscalCandidate(args),xml=result.bytes.toString('utf8');
   assert.equal(result.status,'unsigned-candidate');
   assert.equal(result.totals.taxInclusiveTotal,'115.00');
   assert.equal(result.totals.vatTotal,'15.00');
   assert(xml.includes(seller.vatNumber));assert(xml.includes(seller.crn));
   assert(xml.includes(seller.name.replaceAll('&','&amp;')));
   assert(xml.includes('<cbc:InvoiceTypeCode name="'+(mode==='standard'?'0100000':'0200000')+'">'));
   assert.doesNotMatch(xml,/SignatureValue|<cbc:ID>QR<\/cbc:ID>/);
   output.push({mode,kind,xml,digest:xmlDigest(result.bytes)});
  }
 }
 assert.equal(output.length,6);
 assert.equal(new Set(output.map(x=>x.digest)).size,6);
 return output;
}
test('published workspace loader binds companies, active branches and documents to exact owner scope',async()=>{
 const a=await load(tx,{accountUid:uid,workspaceId:'company-alpha'});
 const b=await load(tx,{accountUid:uid,workspaceId:'company-bravo'});
 assert.deepEqual(a.company,companyA);
 assert.deepEqual(b.company,companyB);
 assert.deepEqual(a.branches.map(x=>x.id),['branch-alpha']);
 assert.deepEqual(b.branches.map(x=>x.id),['branch-bravo']);
 assert.deepEqual(a.documents.map(x=>x.id),['doc-alpha']);
 assert.deepEqual(b.documents.map(x=>x.id),['doc-bravo']);
 assert.equal(a.sourceRevision,revision);
 assert.equal(a.sourceSha256,meta.sha256);
 await assert.rejects(load(tx,{accountUid:'foreign-user',workspaceId:'company-alpha'}),/FISCAL_COMPANY_SYNC_REQUIRED/);
 await assert.rejects(load(tx,{accountUid:uid,workspaceId:'company-unknown'}),/FISCAL_PROFILE_FORBIDDEN/);
});
test('two company profiles produce 12 actual unsigned LOUREX UBL candidates with isolated seller identities',async()=>{
 const [a,b]=await Promise.all(['company-alpha','company-bravo'].map(workspaceId=>load(tx,{accountUid:uid,workspaceId})));
 const sellerA=complianceSeller(a.company,profile,unitFor(a.company));
 const sellerB=complianceSeller(b.company,profile,unitFor(b.company));
 assert.throws(()=>complianceSeller(a.company,profile,unitFor(b.company)),/PRODUCTION_COMPLIANCE_INPUT_INVALID/);
 assert.throws(()=>complianceSeller(b.company,profile,unitFor(a.company)),/PRODUCTION_COMPLIANCE_INPUT_INVALID/);
 const xmlA=buildSix(sellerA,'alpha',101);
 const xmlB=buildSix(sellerB,'bravo',201);
 for(const row of xmlA){assert(!row.xml.includes(sellerB.vatNumber));assert(!row.xml.includes(sellerB.name));}
 for(const row of xmlB){assert(!row.xml.includes(sellerA.vatNumber));assert(!row.xml.includes(sellerA.name));}
 assert.equal(new Set([...xmlA,...xmlB].map(x=>x.digest)).size,12);
});
