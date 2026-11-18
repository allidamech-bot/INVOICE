import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyAuthorityCertificate} from '../api/_fiscal/authority-certificate.js';
const dir=mkdtempSync(join(tmpdir(),'fiscal-ca-'));
process.on('exit',()=>rmSync(dir,{recursive:true,force:true}));
const run=(...args)=>{const r=spawnSync('openssl',args,{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
const oid='1.3.6.1.4.1.55555.1'; // synthetic only
mkdirSync(join(dir,'newcerts'));
for(const [name,value] of Object.entries({index:'',serial:'1000\n',crlnumber:'1000\n'}))writeFileSync(join(dir,name),value);
writeFileSync(join(dir,'ca.cnf'),`[ca]\ndefault_ca=CA\n[CA]\ndatabase=index\nserial=serial\ncrlnumber=crlnumber\nnew_certs_dir=newcerts\ncertificate=root.pem\nprivate_key=root.key\ndefault_md=sha256\ndefault_days=30\ndefault_crl_days=7\npolicy=dn\nx509_extensions=leaf\ncrl_extensions=crl\n[dn]\ncommonName=supplied\n[leaf]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\ncertificatePolicies=${oid}\n[crl]\nauthorityKeyIdentifier=keyid:always\n`);
run('req','-new','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:secp256k1','-nodes','-subj','/CN=Synthetic Root','-days','30','-keyout','root.key','-out','root.pem','-addext','basicConstraints=critical,CA:TRUE,pathlen:0','-addext','keyUsage=critical,keyCertSign,cRLSign','-addext','subjectKeyIdentifier=hash');
run('req','-new','-newkey','ec','-pkeyopt','ec_paramgen_curve:secp256k1','-nodes','-subj','/CN=Synthetic Authority','-keyout','leaf.key','-out','leaf.csr');
run('ca','-batch','-config','ca.cnf','-in','leaf.csr','-out','leaf.pem','-notext');
for(const name of ['leaf','root'])run('x509','-in',name+'.pem','-outform','DER','-out',name+'.der');
run('ca','-gencrl','-config','ca.cnf','-out','good.pem');run('crl','-in','good.pem','-outform','DER','-out','good.der');
const read=name=>readFileSync(join(dir,name+'.der'));
const chainDer=[read('leaf'),read('root')],crlsDer=[read('good')];
const sha=b=>createHash('sha256').update(b).digest('hex');
const trust={environment:'simulation',rootDigest:sha(chainDer[1]),authoritySignerDigests:[sha(chainDer[0])],policyOid:oid,curve:'secp256k1'};
const now=new Date().toISOString();
const input={environment:'simulation',chainDer,crlsDer,trust,signedAt:now,observedAt:now};
test('real PKIX, exact pinned authority signer and CRL pass',()=>assert.equal(verifyAuthorityCertificate(input),true));
test('untrusted root or signer, wrong policy, missing CRL, wrong curve or time fail closed',()=>{
  for(const patch of [{trust:{...trust,rootDigest:'0'.repeat(64)}},{trust:{...trust,authoritySignerDigests:['0'.repeat(64)]}},{trust:{...trust,policyOid:'1.2.3.4'}},{trust:{...trust,curve:'prime256v1'}},{crlsDer:[]},{environment:'production'},{signedAt:new Date(Date.parse(now)-86400000).toISOString()},{signedAt:new Date(Date.parse(now)+1000).toISOString()},{chainDer:[...chainDer].reverse()}])assert.equal(verifyAuthorityCertificate({...input,...patch}),false);
});
test('actual signed revoked list and corrupted CRL are rejected',()=>{
  run('ca','-config','ca.cnf','-revoke','leaf.pem');run('ca','-gencrl','-config','ca.cnf','-out','revoked.pem');run('crl','-in','revoked.pem','-outform','DER','-out','revoked.der');
  const time=new Date().toISOString();assert.equal(verifyAuthorityCertificate({...input,signedAt:time,observedAt:time,crlsDer:[read('revoked')]}),false);
  const corrupt=Buffer.from(crlsDer[0]);corrupt[corrupt.length-1]^=1;assert.equal(verifyAuthorityCertificate({...input,crlsDer:[corrupt]}),false);
});
