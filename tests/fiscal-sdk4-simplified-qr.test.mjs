import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {X509Certificate,createHash,sign} from 'node:crypto';
import {verifySdk4SimplifiedQr} from '../api/_fiscal/sdk4-simplified-qr.js';

test('SDK4 simplified QR representation and signature over digest bytes, offline synthetic certificate',()=>{
 const dir=mkdtempSync(join(tmpdir(),'lourex-sdk4-qr-'));
 try{
  const run=(args)=>{const p=spawnSync('openssl',args,{cwd:dir,timeout:15000});assert.equal(p.status,0,p.stderr?.toString());return p.stdout;};
  run(['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:secp256k1','-nodes','-keyout','leaf.key','-out','leaf.pem','-days','2','-subj','/CN=LOUREX Synthetic','-addext','basicConstraints=critical,CA:FALSE']);
  const leaf=new X509Certificate(readFileSync(join(dir,'leaf.pem'))),leafDer=leaf.raw,key=readFileSync(join(dir,'leaf.key'));
  // Obtain the actual certificate signature via OpenSSL's human-readable
  // ASN.1 certificate dump, separately from the verifier's DER parser.
  const dump=run(['x509','-in','leaf.pem','-noout','-text']).toString();
  const signatureLines=dump.split('Signature Value:').at(-1);
  const caSignature=Buffer.from(signatureLines.replace(/[^0-9a-f]/gi,''),'hex');
  assert.ok(caSignature.length>=68&&caSignature.length<=72);
  const h=createHash('sha256').update('synthetic invoice bytes').digest(),invoiceHash=h.toString('base64');
  const xmlSignature=sign('sha256',h,{key,dsaEncoding:'der'}).toString('base64');
  const f={invoiceHash,xmlSignature,leafDer,sellerName:'شركة اختبار',vatNumber:'300000000000003',timestamp:'2026-11-19T10:00:00Z',total:'115.00',vat:'15.00'};
  const values=[f.sellerName,f.vatNumber,f.timestamp.slice(0,-1),f.total,f.vat,f.invoiceHash,f.xmlSignature].map(s=>Buffer.from(s));
  values.push(leaf.publicKey.export({type:'spki',format:'der'}),caSignature);
  const encode=v=>Buffer.concat(v.map((b,i)=>Buffer.concat([Buffer.from([i+1,b.length]),b]))).toString('base64');
  const payload=encode(values);assert.equal(verifySdk4SimplifiedQr({...f,payload}),true);
  for(let i=0;i<values.length;i++){const x=values.map(b=>Buffer.from(b));x[i][0]^=1;assert.equal(verifySdk4SimplifiedQr({...f,payload:encode(x)}),false,'tag '+(i+1));}
  const wrong=sign('sha256',Buffer.from('synthetic invoice bytes'),{key,dsaEncoding:'der'}).toString('base64');
  const bad=values.map(b=>Buffer.from(b));bad[6]=Buffer.from(wrong);
  assert.equal(verifySdk4SimplifiedQr({...f,xmlSignature:wrong,payload:encode(bad)}),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
