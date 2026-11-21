import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {complianceSeller,makeComplianceInput,verifiedComplianceReceipt} from '../api/_fiscal/production-compliance-input.js';
const company={nameAr:'Test seller',vatNumber:'300000000000003',commercialRegistration:'1234567890',city:'Riyadh'};
const profile={version:1,details:{sellerIdScheme:'CRN',buildingNumber:'1234',postalCode:'12345',street:'Street',district:'District'}};
const unit={profileVersion:1,issuer:{vatNumber:company.vatNumber,legalName:company.nameAr}};
const seller=complianceSeller(company,profile,unit),testBuyer={...seller,vatNumber:'300000000000013',crn:'1234567891',name:'Test buyer'};
const required=['standard-invoice','standard-credit','standard-debit','simplified-invoice','simplified-credit','simplified-debit'];
const at='2026-11-20T00:00:00.000Z';
const uuid=i=>'11111111-1111-4111-8111-'+String(i+1).padStart(12,'0');
const hash=i=>Buffer.alloc(32,i+1).toString('base64');
test('six compliance-only UBL inputs use real scoped seller, unique identities, original references and separate sequence',()=>{
 const prior=[];
 for(let i=0;i<required.length;i++){
  const v=makeComplianceInput({type:required[i],seller,testBuyer,prior,required,uuid:uuid(i),at});
  assert.equal(v.icv,String(i+1));assert.deepEqual(v.seller,seller);assert.equal(v.buyer===null,i>=3);
  if(i)assert.equal(v.previousInvoiceHash,hash(i-1));
  if(v.kind!=='invoice')assert.equal(v.original.uuid,uuid(i<3?0:3));
  assert.equal(v.lines[0].name,'ZATCA compliance test only');
  prior.push({type:required[i],uuid:v.uuid,icv:v.icv,invoiceHash:hash(i),number:v.number,issueDate:v.issueDate});
 }
});
test('no invented seller, missing buyer, reused identity or out-of-order check',()=>{
 assert.throws(()=>complianceSeller({...company,vatNumber:'300000000000013'},profile,unit));
 assert.throws(()=>complianceSeller(company,{...profile,version:2},unit));
 const input={type:required[0],seller,testBuyer,prior:[],required,uuid:uuid(0),at};
 assert.throws(()=>makeComplianceInput({...input,testBuyer:null}));
 assert.throws(()=>makeComplianceInput({...input,testBuyer:seller}));
 assert.throws(()=>makeComplianceInput({...input,type:required[1]}));
});
test('positive authority receipt must match original bytes, mode and successful validation',()=>{
 const sha=b=>createHash('sha256').update(b).digest('hex');
 const bytes=Buffer.from(JSON.stringify({reportingStatus:'REPORTED',validationResults:{status:'PASS',errorMessages:[],warningMessages:[]}}));
 const p={mode:'reporting',httpStatus:200,bytes,evidenceDigest:sha(bytes)};
 assert.equal(verifiedComplianceReceipt(p),'verified-pass');
 assert.equal(verifiedComplianceReceipt({...p,mode:'clearance'}),null);
 assert.equal(verifiedComplianceReceipt({...p,httpStatus:400}),null);
 assert.equal(verifiedComplianceReceipt({...p,evidenceDigest:'0'.repeat(64)}),null);
 const rejected=Buffer.from(JSON.stringify({reportingStatus:'REPORTED',validationResults:{status:'ERROR',errorMessages:['error'],warningMessages:[]}}));
 assert.equal(verifiedComplianceReceipt({...p,bytes:rejected,evidenceDigest:sha(rejected)}),null);
});
