// Offline integrated acceptance: actual LOUREX XML, real SoftHSM key,
// synthetic CA with CRL, exact official SDK 4.0.0 validation. No Firebase,
// network, permanent EGS keys or authority certificate claim.
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID,X509Certificate} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createStagingKeyStore} from '../../api/_fiscal/staging-key-store.js';
import {createSoftHsmStagingCsr,verifySoftHsmStagingCsr} from '../../api/_fiscal/managed-csr.js';
import {createStagingProtectedSigningSession} from '../../api/_fiscal/protected-signing.js';
import {createStagingCanonicalizer} from '../../api/_fiscal/staging-runtime.js';
import {createSdk4LocalValidator} from '../../api/_fiscal/sdk4-local-validator.js';
import {buildManagedSdk4SimplifiedStamp,verifySdk4SimplifiedStamp} from '../../api/_fiscal/sdk4-xades-candidate.js';
import {buildFiscalCandidate} from '../../api/_fiscal/ubl-draft.js';
import {makeComplianceInput} from '../../api/_fiscal/production-compliance-input.js';
import {hashCanonicalInvoice} from '../../api/_fiscal/fiscal-artifacts.js';

const [installationRoot,manifestPath,javaHome,pythonExecutable]=process.argv.slice(2);
assert.equal(process.argv.length,6);
assert([installationRoot,manifestPath,javaHome,pythonExecutable].every(isAbsolute));
const manifestSha256=createHash('sha256').update(readFileSync(manifestPath)).digest('hex');
const dir=mkdtempSync(join(tmpdir(),'lourex-integrated-xml-'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const file=(name,bytes)=>writeFileSync(join(dir,name),bytes,{mode:0o600});
function run(cmd,args){
 const r=spawnSync(cmd,args,{cwd:dir,timeout:30000,maxBuffer:262144});
 assert(!r.error&&r.status===0,'LOCAL_ACCEPTANCE_TOOL_FAILED');
}
const ssl=(...args)=>run('/usr/bin/openssl',args);
try{
 process.umask(0o077);
 const stateDir=join(dir,'state'),tokens=join(dir,'tokens'),configPath=join(dir,'softhsm.conf'),pinSecretPath=join(dir,'pin');
 mkdirSync(stateDir,{mode:0o700});mkdirSync(tokens,{mode:0o700});mkdirSync(join(dir,'newcerts'),{mode:0o700});
 file('softhsm.conf','directories.tokendir = '+tokens+'\nobjectstore.backend = file\nlog.level = ERROR\n');
 file('pin',randomBytes(32));file('index','');file('serial','1000\n');file('crlnumber','1000\n');
 const scope={environment:'simulation',accountUid:'synthetic-owner',workspaceId:'synthetic-workspace',egsId:'synthetic-egs'};
 let authorized=true;
 const options={stateDir,configPath,pinSecretPath,authorizeProvision:async()=>authorized,authorizeBinding:async()=>authorized};
 const keys=createStagingKeyStore(options),binding=await keys.provision(scope);
 const reopened=createStagingKeyStore(options),signer=await reopened.resolveSigner(scope,binding);
 const issuer={accountUid:scope.accountUid,workspaceId:scope.workspaceId,issuerCountry:'SA',saRegime:'phase-2',vatNumber:'399999999900003',legalName:'LOUREX Synthetic QA'};
 const unit={egsId:scope.egsId,serialNumber:'1-LOUREX|2-INVOICE|3-SYNTHETIC',organizationUnit:'Riyadh',commonName:'LOUREX Synthetic QA',functionalityMap:'1100',registeredAddress:'Riyadh',businessCategory:'Trading'};
 const csr=await createSoftHsmStagingCsr({scope,issuer,unit,binding,signer});
 const csrBytes=Buffer.from(csr.csr,'base64');
 assert(verifySoftHsmStagingCsr({scope,issuer,unit,binding,csr:csrBytes,publicKey:csr.publicKey}));
 file('leaf.csr',csrBytes);ssl('req','-in','leaf.csr','-verify','-noout');
 const oid='1.3.6.1.4.1.55555.1';
 file('ca.cnf','[ca]\ndefault_ca=CA\n[CA]\ndatabase=index\nserial=serial\ncrlnumber=crlnumber\nnew_certs_dir=newcerts\ncertificate=root.pem\nprivate_key=root.key\ndefault_md=sha256\ndefault_days=30\ndefault_crl_days=7\npolicy=dn\nx509_extensions=leaf\ncrl_extensions=crl\n[dn]\ncountryName=optional\norganizationName=optional\norganizationalUnitName=optional\ncommonName=supplied\n[leaf]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\ncertificatePolicies='+oid+'\n[crl]\nauthorityKeyIdentifier=keyid:always\n');
 ssl('req','-new','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:secp256k1','-nodes','-subj','/CN=LOUREX Test Root','-days','30','-keyout','root.key','-out','root.pem','-addext','basicConstraints=critical,CA:TRUE,pathlen:0','-addext','keyUsage=critical,keyCertSign,cRLSign','-addext','subjectKeyIdentifier=hash');
 ssl('ca','-batch','-config','ca.cnf','-in','leaf.csr','-out','leaf.pem','-notext');
 ssl('ca','-gencrl','-config','ca.cnf','-out','good.pem');ssl('crl','-in','good.pem','-outform','DER','-out','good.der');
 const chainDer=['leaf.pem','root.pem'].map(n=>new X509Certificate(readFileSync(join(dir,n))).raw);
 const leaf=new X509Certificate(chainDer[0]);
 assert.equal(hash(leaf.publicKey.export({format:'der',type:'spki'})),binding.publicKeyDigest);
 const trust={environment:'simulation',rootDigest:hash(chainDer[1]),egsPolicyOid:oid};
 const credential={...scope,kind:'operational',issuerVat:issuer.vatNumber,keyVersion:binding.keyVersion,publicKeyDigest:binding.publicKeyDigest,leafDigest:hash(chainDer[0])};
 const session=await createStagingProtectedSigningSession({scope,binding,credential,chainDer,crlsDer:[readFileSync(join(dir,'good.der'))],trust,authorizeBinding:async()=>authorized,stagingSignerOptions:reopened.signingOptions(binding)});
 console.log('PASS: persistent SoftHSM key, CSR and certificate-bound session (synthetic CA)');
 const javaSource=fileURLToPath(new URL('./CanonicalInvoice.java',import.meta.url));
 run(join(javaHome,'bin/javac'),['-d',dir,javaSource]);
 const canonicalize=createStagingCanonicalizer({javaHome,classPath:dir});
 const validate=createSdk4LocalValidator({pythonExecutable,installationRoot,manifestPath,manifestSha256,javaHome,canonicalize});
 const documentBytes=Buffer.from('LOUREX synthetic QA policy only'),policy={identifier:'https://zatca.gov.sa/qa-fixture',documentBytes,sha256:hash(documentBytes)};
 const seller={country:'SA',vatNumber:issuer.vatNumber,crn:'1000000000',building:'1234',postal:'12345',street:'Test Street',district:'Test District',city:'Riyadh',name:issuer.legalName};
 const testBuyer={...seller,vatNumber:'311111111111113',crn:'1000000001',name:'Synthetic Buyer'};
 for(const mode of ['standard','simplified']){
  const type=mode+'-invoice',required=[type,mode+'-credit',mode+'-debit'];
  const invoice=makeComplianceInput({type,seller,testBuyer,prior:[],uuid:randomUUID(),at:session.at,required});
  const unsigned=Buffer.from(buildFiscalCandidate(invoice).bytes),invoiceHash=hashCanonicalInvoice(canonicalize(unsigned,'invoice'));
  let bytes=unsigned;
  if(mode==='simplified'){
   const signed=await buildManagedSdk4SimplifiedStamp({unsigned,session,policy,canonicalize});
   assert.equal(signed.invoiceHash,invoiceHash);
   assert(verifySdk4SimplifiedStamp({unsigned,bytes:signed.bytes,leafDer:chainDer[0],at:session.at,policy,canonicalize}));
   bytes=signed.bytes;
  }
  const proof=await validate({scope,mode:mode==='standard'?'clearance':'reporting',invoice,bytes,invoiceHash});
  assert.equal(proof.xmlSha256,hash(bytes));assert.equal(proof.kind,type);
  console.log('PASS: LOUREX '+mode+' XML, exact SDK4 bytes, '+proof.stages.join(','));
 }
 authorized=false;
 await assert.rejects(session.sign('sdk4-invoice-hash',randomBytes(32)));
 console.log('LOUREX INTEGRATED XML SDK4 PASSED');
}finally{rmSync(dir,{recursive:true,force:true});}
