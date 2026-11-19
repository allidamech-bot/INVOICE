import test from 'node:test';
import assert from 'node:assert/strict';
import {hashCanonicalInvoice,hashArtifact,phase1QrPayload,phase2QrCandidate,decodeFiscalQr} from '../api/_fiscal/fiscal-artifacts.js';

const invoice={sellerName:'شركة اختبار',vatNumber:'300000000000003',timestamp:'2026-11-18T10:00:00Z',total:'115.00',vat:'15.00'};
const fields={mode:'simplified',invoiceHash:Buffer.alloc(32,1),signature:Buffer.alloc(64,2),publicKey:Buffer.alloc(88,3),caSignature:Buffer.alloc(72,4)};
test('hash outputs distinguish base64 invoice digest from hex artifact digest',()=>{
  const b=Buffer.from('abc');
  assert.equal(hashCanonicalInvoice(b),'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
  assert.equal(hashArtifact(b),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.throws(()=>hashCanonicalInvoice('abc'));assert.throws(()=>hashArtifact(Buffer.alloc(0)));
});
test('phase-one TLV uses UTF-8 byte count for Arabic, not character count',()=>{
  const qr=phase1QrPayload(invoice), bytes=Buffer.from(qr,'base64');
  assert.equal(bytes[0],1);assert.equal(bytes[1],Buffer.byteLength(invoice.sellerName,'utf8'));
  assert.deepEqual(decodeFiscalQr(qr,'phase1').map(x=>x.value.toString()),Object.values(invoice));
});
test('phase-two candidate preserves exact binary inputs and nine ordered tags',()=>{
  const qr=phase2QrCandidate(invoice,fields), decoded=decodeFiscalQr(qr,'simplified');
  assert.deepEqual(decoded.map(x=>x.tag),[1,2,3,4,5,6,7,8,9]);
  assert.deepEqual(decoded.slice(5).map(x=>x.value),[fields.invoiceHash,fields.signature,fields.publicKey,fields.caSignature]);
  assert.throws(()=>decodeFiscalQr(qr,'phase1'));
});
test('standard candidate excludes technical CA signature; simplified requires it',()=>{
  const {caSignature,...rest}=fields;
  assert.equal(decodeFiscalQr(phase2QrCandidate(invoice,{...rest,mode:'standard'}),'standard').length,8);
  assert.throws(()=>phase2QrCandidate(invoice,{...fields,mode:'standard'}));
  assert.throws(()=>phase2QrCandidate(invoice,rest));
});
test('invalid date, VAT, amounts, malformed Unicode and oversize fail closed',()=>{
  for(const patch of [{timestamp:'2026-02-30T10:00:00Z'},{vatNumber:'123'},{vat:'116.00'},{total:'1e3'},{sellerName:'\ud800'},{sellerName:'ع'.repeat(128)}])
    assert.throws(()=>phase1QrPayload({...invoice,...patch}));
  assert.throws(()=>phase2QrCandidate(invoice,{...fields,invoiceHash:Buffer.alloc(31)}));
  assert.throws(()=>phase2QrCandidate(invoice,{...fields,signature:Buffer.alloc(255),publicKey:Buffer.alloc(255)}));
});
test('truncated, reordered or noncanonical QR payloads are rejected',()=>{
  const qr=phase1QrPayload(invoice), bytes=Buffer.from(qr,'base64');
  assert.throws(()=>decodeFiscalQr(bytes.subarray(0,-1).toString('base64'),'phase1'));
  bytes[0]=2;assert.throws(()=>decodeFiscalQr(bytes.toString('base64'),'phase1'));
  assert.throws(()=>decodeFiscalQr(qr+'=','phase1'));
});
