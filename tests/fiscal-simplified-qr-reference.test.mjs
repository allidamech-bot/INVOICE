import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash,createPrivateKey,X509Certificate} from 'node:crypto';
import {buildSimplifiedQrReference,verifySimplifiedQrReference} from '../api/_fiscal/simplified-qr-reference.js';
import {decodeFiscalQr} from '../api/_fiscal/fiscal-artifacts.js';
import {FIRST_PREVIOUS_INVOICE_HASH} from '../dist/src/lib/fiscal-issuance.js';
const scope={accountUid:'synthetic',workspaceId:'company',egsId:'unit',environment:'simulation'};
const seller={country:'SA',vatNumber:'300000000000003',crn:'1000000000',building:'1234',postal:'12345',street:'شارع اختبار',district:'حي اختبار',city:'الرياض',name:'شركة اختبار & شركاء'};
const invoice={currency:'SAR',mode:'simplified',kind:'invoice',uuid:'11111111-1111-4111-8111-111111111111',icv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH,number:'QA-1',issueDate:'2026-11-18',issueTime:'10:00:00',supplyDate:'2026-11-18',paymentMeans:'30',seller,buyer:null,lines:[{id:'line',name:'اختبار',quantity:'2',unitNetPrice:'50',unitCode:'PCE',category:'S',rate:'15'}]};
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
const create=(patch={})=>buildSimplifiedQrReference({invoice,certificateConfig:config,policy,canonicalize,...patch});
const verify=(bytes,patch={})=>verifySimplifiedQrReference({invoice,bytes,chain:config.chainDer,at:config.at,policy,canonicalize,...patch});
let output;
test('actual signed XML binds all nine QR fields to invoice and certificate',()=>{
  output=create();assert.equal(output.status,'offline-xades-qr-reference');
  assert.equal(output.artifactDigest,digest(output.bytes));assert.ok(verify(output.bytes));
  const fields=decodeFiscalQr(output.payload,'simplified').map(f=>f.value);
  assert.deepEqual(fields.slice(0,5).map(b=>b.toString()),[seller.name,seller.vatNumber,'2026-11-18T10:00:00Z','115.00','15.00']);
  assert.equal(fields[5].toString('base64'),output.invoiceHash);assert.equal(fields[6].length,64);
  assert.deepEqual(fields[7],new X509Certificate(config.chainDer[0]).publicKey.export({type:'spki',format:'der'}));
  assert.ok(fields[8].length>0);assert.ok(output.payload.length<=700);
});
test('tampered QR fields, duplicate QR and changed invoice are rejected',()=>{
  const xml=output.bytes.toString();
  const fields=decodeFiscalQr(output.payload,'simplified');
  // Change one byte of each tag while retaining valid TLV lengths.
  for(const tag of [1,4,5,6,7,8,9]){
    const raw=Buffer.concat(fields.map(({tag:t,value})=>{const v=Buffer.from(value);if(t===tag)v[v.length-1]^=1;return Buffer.concat([Buffer.from([t,v.length]),v]);}));
    assert.equal(verify(Buffer.from(xml.replace(output.payload,raw.toString('base64')))),false,'tag '+tag);
  }
  assert.equal(verify(Buffer.from(xml.replace('<cbc:ID>QR</cbc:ID>','<cbc:ID>QR</cbc:ID><cbc:ID>QR</cbc:ID>'))),false);
  assert.equal(verify(output.bytes,{invoice:{...invoice,number:'changed'}}),false);
  assert.equal(verify(Buffer.from(xml.replace('QA-1','QA-2'))),false);
});
test('standard invoices and wrong signing certificate cannot obtain simplified QR',()=>{
  assert.throws(()=>create({invoice:{...invoice,mode:'standard'}}));
  assert.throws(()=>create({certificateConfig:{...config,trustedRootDigests:['0'.repeat(64)]}}));
});
