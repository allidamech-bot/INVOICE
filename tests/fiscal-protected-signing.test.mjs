import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createPrivateKey,X509Certificate,sign,verify} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProtectedSigningSession,requireProtectedSigningSession} from '../api/_fiscal/protected-signing.js';
import {crc32c} from '../api/_fiscal/managed-kms.js';
import {fileURLToPath} from 'node:url';
import {buildManagedSdk4SimplifiedStamp,verifySdk4SimplifiedStamp,sdk4StampSigningTime} from '../api/_fiscal/sdk4-xades-candidate.js';
const dir=mkdtempSync(join(tmpdir(),'protected-signing-'));
process.on('exit',()=>rmSync(dir,{recursive:true,force:true}));
const ssl=(...args)=>{const r=spawnSync('openssl',args,{cwd:dir});assert.equal(r.status,0,r.stderr?.toString());};
const oid='1.3.6.1.4.1.55555.1';mkdirSync(join(dir,'newcerts'));
for(const [k,v] of Object.entries({index:'',serial:'1000\n',crlnumber:'1000\n'}))writeFileSync(join(dir,k),v);
writeFileSync(join(dir,'ca.cnf'),`[ca]\ndefault_ca=CA\n[CA]\ndatabase=index\nserial=serial\ncrlnumber=crlnumber\nnew_certs_dir=newcerts\ncertificate=root.pem\nprivate_key=root.key\ndefault_md=sha256\ndefault_days=30\ndefault_crl_days=7\npolicy=dn\nx509_extensions=leaf\ncrl_extensions=crl\n[dn]\ncommonName=supplied\n[leaf]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\ncertificatePolicies=${oid}\n[crl]\nauthorityKeyIdentifier=keyid:always\n`);
ssl('req','-new','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:secp256k1','-nodes','-subj','/CN=Test Root','-days','30','-keyout','root.key','-out','root.pem','-addext','basicConstraints=critical,CA:TRUE,pathlen:0','-addext','keyUsage=critical,keyCertSign,cRLSign','-addext','subjectKeyIdentifier=hash');
ssl('req','-new','-newkey','ec','-pkeyopt','ec_paramgen_curve:secp256k1','-nodes','-subj','/CN=Test EGS','-keyout','leaf.key','-out','leaf.csr');ssl('ca','-batch','-config','ca.cnf','-in','leaf.csr','-out','leaf.pem','-notext');
ssl('ca','-gencrl','-config','ca.cnf','-out','good.pem');ssl('crl','-in','good.pem','-outform','DER','-out','good.der');
const read=n=>readFileSync(join(dir,n)),chainDer=['leaf.pem','root.pem'].map(n=>new X509Certificate(read(n)).raw),leaf=new X509Certificate(chainDer[0]);
const key=createPrivateKey(read('leaf.key')),spki=leaf.publicKey.export({type:'spki',format:'der'}),pem=leaf.publicKey.export({type:'spki',format:'pem'});
const projectId='test-fiscal-qa',scope={environment:'simulation',accountUid:'owner',workspaceId:'company',egsId:'egs'},keyVersion='projects/'+projectId+'/locations/global/keyRings/qa/cryptoKeys/egs/cryptoKeyVersions/1';
const sha=b=>createHash('sha256').update(b).digest(),hex=b=>sha(b).toString('hex'),crc=b=>String(crc32c(b));
const binding={...scope,keyVersion,publicKeyDigest:hex(spki),protectionLevel:'HSM'},credential={...scope,kind:'operational',issuerVat:'300000000000003',keyVersion,publicKeyDigest:hex(spki),leafDigest:hex(chainDer[0])};
const trust={environment:'simulation',rootDigest:hex(chainDer[1]),egsPolicyOid:oid},bytes=Buffer.from('canonical test bytes');
function fixture(patch={},message=bytes){
  let calls=0,signCalls=0;const args={projectId,scope,binding,credential,chainDer,crlsDer:[read('good.der')],trust,getAccessToken:async()=>'qa-token',fetchImpl:async(url,options)=>{
    calls++;if(url.endsWith('/publicKey'))return new Response(JSON.stringify({name:keyVersion,pem,pemCrc32c:crc(Buffer.from(pem)),algorithm:'EC_SIGN_SECP256K1_SHA256',protectionLevel:'HSM'}));
    signCalls++;assert.deepEqual(JSON.parse(options.body).digest,{sha256:sha(message).toString('base64')});const signature=sign('sha256',message,key);return new Response(JSON.stringify({name:keyVersion,protectionLevel:'HSM',verifiedDigestCrc32c:true,signature:signature.toString('base64'),signatureCrc32c:crc(signature)}));
  },...patch};return {create:()=>createProtectedSigningSession(args),calls:()=>calls,signCalls:()=>signCalls};
}
test('operational EGS certificate and non-exportable signer bind both signatures',async()=>{
  const s=await fixture().create();assert.equal(requireProtectedSigningSession(s),s);assert.equal(s.issuerVat,credential.issuerVat);assert.deepEqual(s.scope,scope);assert.throws(()=>requireProtectedSigningSession({...s}));
  const copied=s.chainDer;copied[0].fill(0);assert.deepEqual(s.chainDer,chainDer);
  for(const purpose of ['xades-signed-info','simplified-qr','pades-signed-attributes'])assert.ok(verify('sha256',bytes,{key:leaf.publicKey,dsaEncoding:'ieee-p1363'},await s.sign(purpose,bytes)));
  await assert.rejects(s.sign('csr',bytes));
  const digest=sha(bytes),f=fixture({},digest),sdk=await f.create();
  const der=await sdk.sign('sdk4-invoice-hash',digest);
  assert.ok(verify('sha256',digest,{key:leaf.publicKey,dsaEncoding:'der'},der));
  assert.equal(verify('sha256',bytes,{key:leaf.publicKey,dsaEncoding:'der'},der),false);
  const before=f.calls();for(const bad of [Buffer.alloc(31),Buffer.alloc(33),digest.toString('base64')])await assert.rejects(sdk.sign('sdk4-invoice-hash',bad),/PROTECTED_SIGNING_INPUT_INVALID/);
  assert.equal(f.calls(),before);
});
test('wrong enrollment, issuer trust, key or missing CRL never contacts KMS',async()=>{
  for(const patch of [{credential:{...credential,leafDigest:'0'.repeat(64)}},{credential:{...credential,keyVersion:keyVersion+'0'}},{credential:{...credential,workspaceId:'other'}},{credential:{...credential,issuerVat:'invalid'}},{credential:{...credential,privateKey:key}},{trust:{...trust,egsPolicyOid:'1.2.3.4'}},{crlsDer:[]},{binding:{...binding,publicKeyDigest:'0'.repeat(64)}}]){const f=fixture(patch);await assert.rejects(f.create());assert.equal(f.calls(),0);}
});
test('native managed SDK4 candidate stamps all three domestic document types using one actual ECDSA signature',async()=>{
  compileCanonicalizer();
  const memo=new Map();const canonicalize=(b,mode)=>{const k=mode+':'+hex(b);if(memo.has(k))return Buffer.from(memo.get(k));const r=spawnSync('java',['-cp',dir,'CanonicalInvoice',mode],{input:b,timeout:10000,maxBuffer:600*1024});assert.equal(r.status,0,r.stderr?.toString());memo.set(k,r.stdout);return Buffer.from(r.stdout);};
  const documentBytes=Buffer.from('synthetic policy, not authority evidence'),policy={identifier:'https://zatca.gov.sa/qa-fixture',documentBytes,sha256:hex(documentBytes)};
  const root='<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">';
  for(const code of ['388','381','383']){
    const unsigned=Buffer.from(root+'<cbc:ID>QA-'+code+'</cbc:ID><cbc:IssueDate>2026-11-19</cbc:IssueDate><cbc:IssueTime>10:00:00Z</cbc:IssueTime><cbc:InvoiceTypeCode name="0200000">'+code+'</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode><cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode><cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme><cbc:CompanyID>'+credential.issuerVat+'</cbc:CompanyID></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>شركة اختبار &amp; شركاء</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty><cac:TaxTotal><cbc:TaxAmount currencyID="SAR">15.00</cbc:TaxAmount></cac:TaxTotal><cac:TaxTotal><cbc:TaxAmount currencyID="SAR">15.00</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="SAR">100.00</cbc:TaxableAmount></cac:TaxSubtotal></cac:TaxTotal><cac:LegalMonetaryTotal><cbc:TaxInclusiveAmount currencyID="SAR">115.00</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal></Invoice>');
    const f=fixture({},sha(canonicalize(unsigned,'invoice'))),session=await f.create();
    const out=await buildManagedSdk4SimplifiedStamp({unsigned,session,policy,canonicalize}),xml=out.bytes.toString();
    const input={unsigned,bytes:out.bytes,leafDer:chainDer[0],at:session.at,policy,canonicalize};
    assert.equal(f.signCalls(),1,'one managed signature request');assert.equal(out.status,'sdk4-managed-candidate');
    assert.equal(out.invoiceHash,sha(canonicalize(unsigned,'invoice')).toString('base64'));assert.equal(out.artifactDigest,hex(out.bytes));assert.ok(verifySdk4SimplifiedStamp(input));
    assert.equal(sdk4StampSigningTime(out.bytes),session.at.slice(0,19)+'.000Z');
    assert.match(xml,/<ds:Reference Type="http:\/\/www.w3.org\/2000\/09\/xmldsig#SignatureProperties"/);
    const propertyText=xml.match(/ {32}<xades:SignedProperties[\s\S]*?<\/xades:SignedProperties>/)[0];
    assert.equal(out.propertiesDigest,Buffer.from(hex(propertyText),'ascii').toString('base64'));
    assert.ok(xml.includes('<ds:DigestValue>'+Buffer.from(hex(chainDer[0].toString('base64')),'ascii').toString('base64')+'</ds:DigestValue>'));
    for(const changed of [xml.replace('QA-'+code,'QA-other'),xml.replace('115.00','114.00'),xml.replace('Target="signature"','Target="other"'),xml.replace('SigningCertificate','SigningCertificateV2'),xml.replace(out.payload,out.payload.slice(0,-5)+'AAAA='),xml.replace('CN=Test Root','CN=Other Root'),xml.replace('SignatureProperties','SignedProperties'),xml.replace(/<ds:SignatureValue>./,'<ds:SignatureValue>!')])assert.equal(verifySdk4SimplifiedStamp({...input,bytes:Buffer.from(changed)}),false);
    const before=f.calls();await assert.rejects(buildManagedSdk4SimplifiedStamp({unsigned:Buffer.from(unsigned.toString().replace(credential.issuerVat,'311111111111113')),session,policy,canonicalize}));assert.equal(f.calls(),before);
  }
});
function compileCanonicalizer(){const r=spawnSync('javac',['-d',dir,fileURLToPath(new URL('../scripts/fiscal/CanonicalInvoice.java',import.meta.url))]);assert.equal(r.status,0,r.stderr?.toString());}
test('revoked EGS and expired signing session cannot sign',async()=>{
  let now=new Date().toISOString();const f=fixture({clock:()=>now}),s=await f.create(),before=f.calls();now=new Date(Date.parse(now)+301000).toISOString();await assert.rejects(s.sign('simplified-qr',bytes),/EGS_CERTIFICATE_NOT_VERIFIED/);await assert.rejects(s.sign('sdk4-invoice-hash',sha(bytes)),/EGS_CERTIFICATE_NOT_VERIFIED/);assert.equal(f.calls(),before);
  ssl('ca','-config','ca.cnf','-revoke','leaf.pem');ssl('ca','-gencrl','-config','ca.cnf','-out','revoked.pem');ssl('crl','-in','revoked.pem','-outform','DER','-out','revoked.der');
  const g=fixture({crlsDer:[read('revoked.der')]});await assert.rejects(g.create());assert.equal(g.calls(),0);
});
