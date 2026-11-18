import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createPrivateKey,createHash,generateKeyPairSync,X509Certificate} from 'node:crypto';
import {verifyFiscalCertificateBinding,signCertificateBoundCandidate} from '../api/_fiscal/certificate-binding.js';
import {verifyFiscalCanonicalBytes} from '../api/_fiscal/fiscal-ecdsa.js';
let dir,config;
const sha=b=>createHash('sha256').update(b).digest('hex');
before(()=>{
  dir=mkdtempSync(join(tmpdir(),'fiscal-certificate-'));
  function openssl(args){const r=spawnSync('openssl',args,{cwd:dir,timeout:15000});assert.equal(r.status,0,'OpenSSL certificate fixture generation failed');}
  openssl(['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:secp256k1','-nodes','-keyout','root.key','-out','root.pem','-subj','/CN=Synthetic QA Root','-days','2','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign']);
  openssl(['req','-new','-newkey','ec','-pkeyopt','ec_paramgen_curve:secp256k1','-nodes','-keyout','leaf.key','-out','leaf.csr','-subj','/CN=Synthetic QA EGS']);
  writeFileSync(join(dir,'extensions.cnf'),'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n');
  openssl(['x509','-req','-in','leaf.csr','-CA','root.pem','-CAkey','root.key','-CAcreateserial','-out','leaf.pem','-days','1','-extfile','extensions.cnf']);
  const chainDer=['leaf.pem','root.pem'].map(f=>new X509Certificate(readFileSync(join(dir,f))).raw);
  const scope={accountUid:'synthetic',workspaceId:'company',egsId:'egs',environment:'simulation'};
  config={scope,credential:{...scope,kind:'operational',leafDigest:sha(chainDer[0])},chainDer,trustedRootDigests:[sha(chainDer[1])],privateKey:createPrivateKey(readFileSync(join(dir,'leaf.key'))),at:new Date().toISOString()};
});
after(()=>{if(dir)rmSync(dir,{recursive:true,force:true});});
test('exact pinned chain and private key bind canonical signature candidate',()=>{
  const bytes=Buffer.from('<SignedInfo>synthetic fixture</SignedInfo>');
  const r=signCertificateBoundCandidate(config,bytes,'ieee-p1363');
  assert.equal(r.status,'signature-candidate');assert.deepEqual(r.certificateDigests,config.chainDer.map(sha));assert.equal(r.signedInfoDigest,sha(bytes));
  assert.equal(verifyFiscalCanonicalBytes(bytes,r.signature,new X509Certificate(config.chainDer[0]).publicKey,'ieee-p1363'),true);
  assert.equal(verifyFiscalCanonicalBytes(Buffer.from('changed'),r.signature,new X509Certificate(config.chainDer[0]).publicKey,'ieee-p1363'),false);
});
test('cross-tenant/EGS, production, wrong pins and mismatched private keys fail',()=>{
  for(const patch of [{scope:{...config.scope,workspaceId:'other'}},{scope:{...config.scope,egsId:'other'}},{scope:{...config.scope,environment:'production'}},{trustedRootDigests:['a'.repeat(64)]},{credential:{...config.credential,leafDigest:'a'.repeat(64)}},{privateKey:generateKeyPairSync('ec',{namedCurve:'secp256k1'}).privateKey}])assert.throws(()=>verifyFiscalCertificateBinding({...config,...patch}));
});
test('expired, malformed, unordered or incomplete certificates fail closed',()=>{
  for(const patch of [{at:'2099-01-01T00:00:00.000Z'},{at:'2000-01-01T00:00:00.000Z'},{at:'2026-02-30T00:00:00.000Z'},{chainDer:[config.chainDer[0]]},{chainDer:[...config.chainDer].reverse()},{chainDer:[Buffer.from('invalid'),config.chainDer[1]]},{chainDer:[...config.chainDer,config.chainDer[1]]}])assert.throws(()=>verifyFiscalCertificateBinding({...config,...patch}));
});
