import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createPublicKey} from 'node:crypto';
import {fiscalPublicKeyDer,signFiscalCanonicalBytes,verifyFiscalCanonicalBytes} from '../api/_fiscal/fiscal-ecdsa.js';

const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'secp256k1'});
const other=generateKeyPairSync('ec',{namedCurve:'secp256k1'});
const bytes=Buffer.from('<test>synthetic signed bytes</test>');

test('real ECDSA SHA-256 signatures verify using their derived public key',()=>{
  const derived=createPublicKey({key:fiscalPublicKeyDer(privateKey),type:'spki',format:'der'});
  for(const format of ['der','ieee-p1363']){
    const signature=signFiscalCanonicalBytes(bytes,privateKey,format);
    assert.equal(verifyFiscalCanonicalBytes(bytes,signature,derived,format),true);
    assert.equal(verifyFiscalCanonicalBytes(bytes,signature,publicKey,format),true);
    assert.equal(verifyFiscalCanonicalBytes(bytes,signature,other.publicKey,format),false);
    assert.equal(verifyFiscalCanonicalBytes(Buffer.from('tampered'),signature,derived,format),false);
  }
});
test('unsupported curves, encodings and private/public key misuse are rejected',()=>{
  const wrong=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  assert.throws(()=>signFiscalCanonicalBytes(bytes,wrong.privateKey,'der'));
  assert.throws(()=>signFiscalCanonicalBytes(bytes,publicKey,'der'));
  assert.throws(()=>signFiscalCanonicalBytes(bytes,privateKey,'unknown'));
  assert.throws(()=>verifyFiscalCanonicalBytes(bytes,Buffer.alloc(64),privateKey,'der'));
  assert.throws(()=>signFiscalCanonicalBytes(Buffer.alloc(0),privateKey,'der'));
});
test('malformed signatures and mismatched signature encodings fail verification',()=>{
  const signature=signFiscalCanonicalBytes(bytes,privateKey,'ieee-p1363');
  assert.equal(signature.length,64);
  assert.equal(verifyFiscalCanonicalBytes(bytes,Buffer.alloc(63),publicKey,'ieee-p1363'),false);
  assert.equal(verifyFiscalCanonicalBytes(bytes,Buffer.alloc(100),publicKey,'der'),false);
  assert.equal(verifyFiscalCanonicalBytes(bytes,Buffer.alloc(2),publicKey,'der'),false);
  assert.equal(verifyFiscalCanonicalBytes(bytes,signature,publicKey,'der'),false);
});
