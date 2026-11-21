import {createHash,X509Certificate,verify} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {decodeFiscalQr} from './fiscal-artifacts.js';
import {verifyAuthorityCertificate,verifyProductionAuthorityCertificate} from './authority-certificate.js';
import {createStandardClearanceVerifier,createProductionStandardClearanceVerifier} from './clearance-verifier.js';

// Configured offline profile only. Neither its signature encoding nor the
// authority trust configuration is endorsed until official vectors pass.
const CAP=512*1024;
const sha=b=>createHash('sha256').update(b).digest();
const utf8=b=>new TextDecoder('utf-8',{fatal:true}).decode(b);
function bytes(b){if(!Buffer.isBuffer(b)||!b.length||b.length>CAP)throw Error('INVALID_XML');return b;}
function java(classPath,name,args,input){
  const r=spawnSync('java',['-cp',classPath,name,...args],{input,timeout:10000,maxBuffer:2*1024*1024});
  if(r.status!==0||r.error)throw Error('XML_VERIFICATION_FAILED');return r.stdout;
}
function frame(b){const n=Buffer.alloc(4);n.writeUInt32BE(bytes(b).length);return Buffer.concat([n,b]);}
function inspect(classPath,xml){
  const raw=java(classPath,'StampInspector',[],bytes(xml));let offset=0;
  const int=()=>{if(offset+4>raw.length)throw Error('TRUNCATED_STAMP');const n=raw.readUInt32BE(offset);offset+=4;return n;};
  const read=()=>{const n=int();if(n<1||n>CAP||offset+n>raw.length)throw Error('INVALID_STAMP_FRAME');const b=raw.subarray(offset,offset+n);offset+=n;return b;};
  const string=()=>utf8(read());
  const invoice=read(),signedInfo=read(),signature=read(),policyId=string(),policyHash=read(),signingTime=string();
  const count=int();if(count<2||count>8)throw Error('INVALID_CHAIN');const chainDer=Array.from({length:count},read);
  const result={invoice,signedInfo,signature,policyId,policyHash,signingTime,chainDer,uuid:string(),subtype:string(),sellerName:string(),vatNumber:string(),issueDate:string(),issueTime:string(),total:string(),vat:string(),qr:string()};
  if(offset!==raw.length)throw Error('EXTRA_STAMP_DATA');return result;
}
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))throw Error('INVALID_TIME');const d=new Date(value),iso=d.toISOString();if(iso!==value&&iso!==value.replace(/Z$/,'.000Z'))throw Error('INVALID_TIME');return iso;}
function money(s){if(!/^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,2})?$/.test(s))throw Error('INVALID_MONEY');const [w,f='']=s.split('.');return w+'.'+f.padEnd(2,'0');}
function matches(x,ctx){return x.uuid===ctx.uuid&&x.subtype.startsWith('01')&&sha(x.invoice).toString('base64')===ctx.invoiceHash;}
function createOfflineVerifier(environment,{classPath,trust,crlsDer,policy,qrProfile,clock=()=>new Date().toISOString()}){
  if(typeof classPath!=='string'||!isAbsolute(classPath)||!trust||trust.environment!==environment||trust.curve!=='secp256k1'||!Array.isArray(crlsDer)||!policy||typeof policy.identifier!=='string'||!/^https:\/\/(?:www\.)?zatca\.gov\.sa\/[A-Za-z0-9_./%-]+$/.test(policy.identifier)||!Buffer.isBuffer(policy.documentBytes)||!policy.documentBytes.length||policy.documentBytes.length>CAP||typeof policy.sha256!=='string'||sha(policy.documentBytes).toString('hex')!==policy.sha256||qrProfile!=='canonical-sha256-der-spki-v1'||typeof clock!=='function')throw Error('UNCONFIRMED_CLEARANCE_PROFILE');
  const trusted=structuredClone(trust),lists=crlsDer.map(b=>Buffer.from(b)),policyId=policy.identifier,policyHash=sha(policy.documentBytes);
  const verifyCertificate=environment==='production'?verifyProductionAuthorityCertificate:verifyAuthorityCertificate;
  return (environment==='production'?createProductionStandardClearanceVerifier:createStandardClearanceVerifier)({
    verifyContent({submitted,cleared,uuid,invoiceHash}){return java(classPath,'ClearanceContent',[uuid,invoiceHash],Buffer.concat([frame(submitted),frame(cleared)])).toString()==='CONTENT_MATCH';},
    verifyStamp(ctx){
      const x=inspect(classPath,ctx.cleared);if(!matches(x,ctx)||x.policyId!==policyId||!x.policyHash.equals(policyHash)||x.signature.length!==64)return false;
      const signedAt=date(x.signingTime),observedAt=date(clock());
      if(Date.parse(signedAt)>Date.parse(observedAt)||Date.parse(observedAt)-Date.parse(signedAt)>86400000)return false;
      const cert={environment,chainDer:x.chainDer,crlsDer:lists,trust:trusted,signedAt,observedAt};
      // Require a valid CRL and chain at both signature and observation time.
      if(!verifyCertificate(cert)||!verifyCertificate({...cert,signedAt:observedAt}))return false;
      const leaf=new X509Certificate(x.chainDer[0]);return verify('sha256',x.signedInfo,{key:leaf.publicKey,dsaEncoding:'ieee-p1363'},x.signature);
    },
    verifyQr(ctx){
      const x=inspect(classPath,ctx.cleared);if(!matches(x,ctx))return false;
      // The current offline profile requires UTC invoice timestamps and raw
      // SHA-256, DER ECDSA and SPKI fields. Do not guess alternate encodings.
      const timestamp=date(x.issueDate+'T'+x.issueTime).replace('.000Z','Z');
      const fields=decodeFiscalQr(x.qr,'standard').map(v=>v.value);
      if(![x.sellerName,x.vatNumber,timestamp,money(x.total),money(x.vat)].every((v,i)=>fields[i].equals(Buffer.from(v))))return false;
      const leaf=new X509Certificate(x.chainDer[0]);
      return fields[5].equals(sha(x.invoice))&&fields[7].equals(leaf.publicKey.export({type:'spki',format:'der'}))&&verify('sha256',x.invoice,{key:leaf.publicKey,dsaEncoding:'der'},fields[6]);
    }
  });
}

export const createOfflineStandardClearanceVerifier=options=>createOfflineVerifier('simulation',options);
export const createOfflineProductionClearanceVerifier=options=>createOfflineVerifier('production',options);
