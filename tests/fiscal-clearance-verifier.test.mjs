import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStandardClearanceVerifier} from '../api/_fiscal/clearance-verifier.js';
const dir=mkdtempSync(join(tmpdir(),'clearance-'));
const built=spawnSync('javac',['-d',dir,'scripts/fiscal/CanonicalInvoice.java','scripts/fiscal/ClearanceContent.java']);
assert.equal(built.status,0,built.stderr?.toString());
process.on('exit',()=>rmSync(dir,{recursive:true,force:true}));
const uuid='11111111-1111-4111-8111-111111111111';
const root='<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">';
const content='<cbc:ID>A1</cbc:ID><cbc:UUID>'+uuid+'</cbc:UUID><cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode><cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="SAR">115.00</cbc:PayableAmount></cac:LegalMonetaryTotal>';
// Deliberately fake signature and QR: tests only the content gate and orchestration.
const ext='<ext:UBLExtensions xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"><ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"/></ext:UBLExtensions>';
const qr='<cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject>TEST</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>';
const signature='<cac:Signature><cbc:ID>test</cbc:ID></cac:Signature>';
const xml=Buffer.from(root+content+'</Invoice>'), cleared=Buffer.from(root+ext+content+qr+signature+'</Invoice>');
const canonical=spawnSync('java',['-cp',dir,'CanonicalInvoice','invoice'],{input:xml});assert.equal(canonical.status,0);
const digest=b=>createHash('sha256').update(b).digest('hex');
const scope={environment:'simulation',accountUid:'test',workspaceId:'synthetic',egsId:'egs'};
const record={...scope,mode:'clearance',uuid,artifactDigest:digest(xml),invoiceHash:createHash('sha256').update(canonical.stdout).digest('base64')};
function framed(...buffers){return Buffer.concat(buffers.flatMap(b=>{const n=Buffer.alloc(4);n.writeUInt32BE(b.length);return [n,b];}));}
function verifyContent({submitted,cleared,uuid,invoiceHash}){
  const r=spawnSync('java',['-cp',dir,'ClearanceContent',uuid,invoiceHash],{input:framed(submitted,cleared),timeout:5000});
  return r.status===0&&r.stdout.toString()==='CONTENT_MATCH';
}
function result(bytes=cleared,patch={}){
  const evidenceBytes=Buffer.from(JSON.stringify({clearanceStatus:'CLEARED',clearedInvoice:bytes.toString('base64'),validationResults:{status:'PASS',errorMessages:[],warningMessages:[]},...patch}));
  return {status:'clearance-response',httpStatus:200,warnings:false,clearedBytes:bytes,evidenceBytes,evidenceDigest:digest(evidenceBytes)};
}
const verifier=(patch={})=>createStandardClearanceVerifier({verifyContent,verifyStamp:()=>true,verifyQr:()=>true,...patch});
const input=(r=result())=>({scope,record,result:r,xml});
test('actual secure XML parsing and canonical content binding for standard invoice',async()=>{
  assert.equal(await verifier()(input()),true);
  assert.equal(await verifier()(input(result(Buffer.from(cleared.toString().replace('115.00','116.00'))))),false);
  assert.equal(await verifier()(input(result(Buffer.from(cleared.toString().replace(uuid,'22222222-2222-4222-8222-222222222222'))))),false);
  assert.equal(await verifier()({...input(),record:{...record,invoiceHash:Buffer.alloc(32).toString('base64')}}),false);
});
test('blocks duplicate QR, missing stamp, nested exclusion and unsafe XML',async()=>{
  for(const bad of [cleared.toString().replace(qr,qr+qr),cleared.toString().replace(ext,''),cleared.toString().replace('115.00','115.00'+qr),'<!DOCTYPE Invoice [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+cleared.toString(),cleared.toString().replace('0100000','0200000')]){
    assert.equal(await verifier()(input(result(Buffer.from(bad)))),false);
  }
});
test('requires exact raw evidence, scope, transport status and both cryptographic checks',async()=>{
  assert.throws(()=>createStandardClearanceVerifier({verifyContent}),/NOT_CONFIGURED/);
  for(const r of [{...result(),evidenceDigest:'0'.repeat(64)},{...result(),clearedBytes:xml},{...result(),httpStatus:500},{...result(),warnings:true},result(cleared,{clearanceStatus:'NOT_CLEARED'}),result(cleared,{validationResults:{status:'PASS',errorMessages:[{}],warningMessages:[]}})])assert.equal(await verifier()(input(r)),false);
  assert.equal(await verifier()({...input(),scope:{...scope,workspaceId:'other'}}),false);
  assert.equal(await verifier({verifyStamp:()=>false})(input()),false);
  assert.equal(await verifier({verifyQr:()=>false})(input()),false);
});
