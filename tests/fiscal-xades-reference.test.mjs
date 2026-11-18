import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash,createPrivateKey,X509Certificate} from 'node:crypto';
import {buildSimplifiedXadesReference,verifySimplifiedXadesReference} from '../api/_fiscal/xades-reference.js';
const scope={accountUid:'synthetic',workspaceId:'company',egsId:'unit',environment:'simulation'};
const root='<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">';
const unsigned=Buffer.from(root+'<cbc:ID>QA-1</cbc:ID><cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode><cac:AccountingSupplierParty><cac:Party><cbc:ID>synthetic</cbc:ID></cac:Party></cac:AccountingSupplierParty></Invoice>');
const digest=b=>createHash('sha256').update(b).digest('hex');
const doc=Buffer.from('synthetic policy fixture, not an official ZATCA document');
const policy={identifier:'https://zatca.gov.sa/qa-fixture',documentBytes:doc,sha256:digest(doc)};
let dir,config;
function command(cmd,args){const r=spawnSync(cmd,args,{cwd:dir,timeout:30000,maxBuffer:600*1024});assert.equal(r.status,0,cmd+' failed: '+r.stderr?.toString());}
before(()=>{
  dir=mkdtempSync(join(tmpdir(),'xades-qa-'));
  command('javac',['-d',dir,fileURLToPath(new URL('../scripts/fiscal/CanonicalInvoice.java',import.meta.url))]);
  command('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:secp256k1','-nodes','-keyout','ca.key','-out','ca.pem','-days','2','-subj','/CN=QA Root','-addext','basicConstraints=critical,CA:TRUE']);
  command('openssl',['req','-new','-newkey','ec','-pkeyopt','ec_paramgen_curve:secp256k1','-nodes','-keyout','leaf.key','-out','leaf.csr','-subj','/CN=QA Leaf']);
  command('openssl',['x509','-req','-in','leaf.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out','leaf.pem','-days','1']);
  const chainDer=['leaf.pem','ca.pem'].map(p=>new X509Certificate(readFileSync(join(dir,p))).raw);
  config={scope,credential:{...scope,kind:'operational',leafDigest:digest(chainDer[0])},privateKey:createPrivateKey(readFileSync(join(dir,'leaf.key'))),chainDer,trustedRootDigests:[digest(chainDer[1])],at:new Date().toISOString()};
});
after(()=>{if(dir)rmSync(dir,{recursive:true,force:true});});
function canonicalize(bytes,mode){const r=spawnSync('java',['-cp',dir,'CanonicalInvoice',mode],{input:bytes,timeout:10000,maxBuffer:600*1024});if(r.status!==0)throw Error('C14N_FAILED');return r.stdout;}
const create=(patch={})=>buildSimplifiedXadesReference({unsigned,certificateConfig:config,policy,canonicalize,...patch});
const verify=(bytes,patch={})=>verifySimplifiedXadesReference({unsigned,bytes,chain:config.chainDer,at:config.at,policy,canonicalize,...patch});
test('offline XAdES references, chain and signature are assembled and independently verified',()=>{
  const out=create(),xml=out.bytes.toString();assert.equal(out.status,'offline-xades-reference');
  assert.equal(out.artifactDigest,digest(out.bytes));assert.equal(verify(out.bytes),true);
  assert.match(xml,/Type="http:\/\/uri.etsi.org\/01903#SignedProperties" URI="#xadesSignedProperties"/);
  assert.equal((xml.match(/<xades:Cert>/g)||[]).length,2);
  assert.match(xml,/<xades:MimeType>text\/xml<\/xades:MimeType>/);
  assert.equal(canonicalize(unsigned,'invoice').toString(),canonicalize(out.bytes,'invoice').toString());
  assert.notEqual(out.invoiceHash,out.propertiesDigest);
});
test('tampering invoice, signature, certificate chain, policy, signing time or references is refused',()=>{
  const out=create(),xml=out.bytes.toString();
  for(const changed of [xml.replace('QA-1','QA-2'),xml.replace('text/xml','application/xml'),xml.replace(/<ds:SignatureValue>./,'<ds:SignatureValue>!'),xml.replace('#xadesSignedProperties','#different'),xml.replace('QA-1','QA-1<cbc:ID>QR</cbc:ID>')])assert.equal(verify(Buffer.from(changed)),false);
  assert.equal(verify(out.bytes,{unsigned:Buffer.from(unsigned.toString().replace('QA-1','QA-2'))}),false);
  assert.equal(verify(out.bytes,{chain:[...config.chainDer].reverse()}),false);
  assert.equal(verify(out.bytes,{at:new Date(Date.parse(config.at)+1000).toISOString()}),false);
  assert.equal(verify(out.bytes,{policy:{...policy,sha256:'0'.repeat(64)}}),false);
});
test('standard, untrusted certificate, invalid policy and injected XML are not signed',()=>{
  for(const xml of [unsigned.toString().replace('0200000','0100000'),unsigned.toString().replace('QA-1','QA-1<!DOCTYPE x>'),unsigned.toString().replace('QA-1','QA-1<cbc:ID>QR</cbc:ID>')])assert.throws(()=>create({unsigned:Buffer.from(xml)}));
  assert.throws(()=>create({certificateConfig:{...config,trustedRootDigests:['0'.repeat(64)]}}));
  assert.throws(()=>create({policy:{...policy,sha256:'0'.repeat(64)}}));
  assert.throws(()=>create({policy:{...policy,identifier:'https://example.com/policy'}}));
});
test('ambiguous SignedInfo or SignedProperties nodes cannot be canonicalized',()=>{
  const xml=create().bytes.toString();
  assert.throws(()=>canonicalize(Buffer.from(xml.replace('</ds:SignedInfo>','</ds:SignedInfo><ds:SignedInfo/>')),'signed-info'));
  assert.throws(()=>canonicalize(Buffer.from(xml.replace('Id="xadesSignedProperties"','Id="other"')),'signed-properties'));
});
