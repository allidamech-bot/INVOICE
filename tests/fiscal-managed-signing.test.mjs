import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign,verify} from 'node:crypto';
import {crc32c} from '../api/_fiscal/managed-kms.js';
import {createQaManagedSigner,ecdsaDerToP1363} from '../api/_fiscal/managed-signing.js';
const projectId='test-fiscal-qa',scope={environment:'simulation',accountUid:'owner',workspaceId:'company',egsId:'egs'};
const keyVersion='projects/'+projectId+'/locations/global/keyRings/qa/cryptoKeys/egs/cryptoKeyVersions/1';
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'secp256k1'});
const spki=publicKey.export({type:'spki',format:'der'}),pem=publicKey.export({type:'spki',format:'pem'});
const bytes=Buffer.from('synthetic canonical signed info'),sha=b=>createHash('sha256').update(b).digest(),crc=b=>String(crc32c(b));
const binding={...scope,keyVersion,publicKeyDigest:sha(spki).toString('hex'),protectionLevel:'HSM'};
const publicResult={name:keyVersion,pem,pemCrc32c:crc(Buffer.from(pem)),algorithm:'EC_SIGN_SECP256K1_SHA256',protectionLevel:'HSM'};
const signature=sign('sha256',bytes,privateKey),signResult={name:keyVersion,signature:signature.toString('base64'),signatureCrc32c:crc(signature),verifiedDigestCrc32c:true,protectionLevel:'HSM'};
function fixture({pub={},sig={},patch={}}={}){
  const calls=[];const signer=createQaManagedSigner({projectId,binding,getAccessToken:async()=>'test-token',fetchImpl:async(url,options)=>{
    calls.push(url);assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer test-token');
    if(url.endsWith('/publicKey')){assert.equal(options.method,'GET');return new Response(JSON.stringify({...publicResult,...pub}));}
    assert.equal(url,'https://cloudkms.googleapis.com/v1/'+keyVersion+':asymmetricSign');assert.equal(options.method,'POST');
    assert.deepEqual(JSON.parse(options.body),{digest:{sha256:sha(bytes).toString('base64')},digestCrc32c:crc(sha(bytes))});
    return new Response(JSON.stringify({...signResult,...sig}));
  },...patch});return {signer,calls};
}
test('pinned HSM signer hashes once, returns locally verified DER or P1363',async()=>{
  const {signer}=fixture();assert.deepEqual(await signer.getPublicKey(scope),spki);
  for(const encoding of ['der','ieee-p1363']){const result=await signer.sign(scope,{purpose:'xades-signed-info',bytes,encoding});assert.ok(verify('sha256',bytes,{key:publicKey,dsaEncoding:encoding},result));}
});
test('wrong tenant, key, environment and unsupported input never reach signing',async()=>{
  const {signer,calls}=fixture();for(const patch of [{environment:'production'},{accountUid:'other'},{workspaceId:'other'},{egsId:'other'}])await assert.rejects(signer.sign({...scope,...patch},{purpose:'csr',bytes,encoding:'der'}));
  await assert.rejects(signer.sign(scope,{purpose:'arbitrary',bytes,encoding:'der'}));assert.equal(calls.length,0);
  for(const b of [{...binding,protectionLevel:'SOFTWARE'},{...binding,keyVersion:keyVersion.replace(projectId,'prod')},{...binding,keyVersion:keyVersion.replace('/cryptoKeyVersions/1','')}])assert.throws(()=>fixture({patch:{binding:b}}));
});
test('public key identity, algorithm and CRC failures prevent signing',async()=>{
  for(const pub of [{name:keyVersion+'0'},{algorithm:'EC_SIGN_P256_SHA256'},{protectionLevel:'SOFTWARE'},{pemCrc32c:'0'}]){const {signer,calls}=fixture({pub});await assert.rejects(signer.sign(scope,{purpose:'csr',bytes,encoding:'der'}));assert.equal(calls.length,1);}
  const {signer}=fixture({patch:{binding:{...binding,publicKeyDigest:'0'.repeat(64)}}});await assert.rejects(signer.getPublicKey(scope));
});
test('reject corrupted signature or a valid signature over different bytes',async()=>{
  const wrong=sign('sha256',Buffer.from('different'),privateKey);
  for(const sig of [{verifiedDigestCrc32c:false},{name:keyVersion+'0'},{protectionLevel:'SOFTWARE'},{signatureCrc32c:'0'},{signature:wrong.toString('base64'),signatureCrc32c:crc(wrong)}]){const {signer}=fixture({sig});await assert.rejects(signer.sign(scope,{purpose:'csr',bytes,encoding:'der'}));}
  for(const invalid of ['3006020100020101','3006020180020101','300702020001020101','300602010102010100'])assert.throws(()=>ecdsaDerToP1363(Buffer.from(invalid,'hex')));
});
test('bounded timeout does not retry an ambiguous remote request',async()=>{
  let calls=0;const {signer}=fixture({patch:{timeoutMs:100,fetchImpl:async()=>{calls++;return new Promise(()=>{});}}});
  await assert.rejects(signer.getPublicKey(scope),/SIGNING_REQUEST_FAILED/);assert.equal(calls,1);
});
