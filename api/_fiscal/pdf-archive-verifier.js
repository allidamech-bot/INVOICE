import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyAuthorityCertificate} from './authority-certificate.js';
import {simulationBase} from './simulation-scope.js';

const HEX=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=ok=>{if(!ok)throw Error('FISCAL_PDF_NOT_VERIFIED');};
const at=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const same=(a,b)=>a&&['accountUid','workspaceId','egsId','environment'].every(k=>a[k]===b[k]);
const script=fileURLToPath(new URL('../../scripts/fiscal/pades_cli.py',import.meta.url));
// Independent archive gate, never a replacement for authority XML validation.
// Trust pins/CRLs and viewer evidence come from independent trusted reviewers.
export function createIndependentFiscalPdfVerifier({pythonExecutable,validator,resolveIndependentEvidence,clock=()=>new Date().toISOString()}={}){
 need(typeof pythonExecutable==='string'&&isAbsolute(pythonExecutable)&&typeof validator==='string'&&isAbsolute(validator)&&typeof resolveIndependentEvidence==='function'&&typeof clock==='function');
 return async function verifyPdf({scope,record,xml,pdf}){
  simulationBase(scope);
  const standard=record?.mode==='clearance'&&record.status==='cleared',simplified=record?.mode==='reporting'&&record.status==='reported';
  need(same(record,scope)&&(standard||simplified)&&UUID.test(record.uuid??'')&&HEX.test(record.resultDigest??'')&&at(record.generatedAt)&&Buffer.isBuffer(xml)&&xml.length>0&&xml.length<=512*1024&&Buffer.isBuffer(pdf)&&pdf.length>0&&pdf.length<=2*1024*1024);
  const accepted=Buffer.from(xml),candidate=Buffer.from(pdf),xmlDigest=sha(accepted),pdfDigest=sha(candidate),mode=standard?'standard':'simplified';
  need(xmlDigest===(standard?record.clearedArtifactDigest:record.artifactDigest));
  const binding={uuid:record.uuid,mode,xmlDigest,pdfDigest,resultDigest:record.resultDigest};
  const proof=await resolveIndependentEvidence({scope:Object.freeze({...scope}),record:Object.freeze({...record}),binding:Object.freeze({...binding}),xml:Buffer.from(accepted),pdf:Buffer.from(candidate)});
  need(proof?.valid===true&&same(proof,scope)&&Object.keys(binding).every(k=>proof[k]===binding[k])&&HEX.test(proof.interoperabilityDigest??'')&&HEX.test(proof.authorityXmlValidationDigest??''));
  let certs=[],signedAt=null;
  if(simplified){
   need(proof.signaturePolicy==='pades-b-b'&&at(proof.signedAt)&&proof.signedAt>=record.generatedAt&&Array.isArray(proof.chainDer)&&proof.chainDer.length>=2&&proof.chainDer.length<=8&&Array.isArray(proof.crlsDer)&&proof.crlsDer.length===proof.chainDer.length-1&&proof.trust?.curve==='secp256k1');
   certs=proof.chainDer.map(b=>{need(Buffer.isBuffer(b)&&b.length>0&&b.length<=32768);return Buffer.from(b);});
   const crls=proof.crlsDer.map(b=>{need(Buffer.isBuffer(b)&&b.length>0&&b.length<=256*1024);return Buffer.from(b);});
   const observedAt=clock();signedAt=proof.signedAt;
   need(verifyAuthorityCertificate({environment:'simulation',chainDer:certs,crlsDer:crls,trust:proof.trust,signedAt,observedAt})&&verifyAuthorityCertificate({environment:'simulation',chainDer:certs,crlsDer:crls,trust:proof.trust,signedAt:observedAt,observedAt}));
  }else{
   // Standard invoices are never stamped with the taxpayer EGS key.
   // This branch requires independently approved unsigned-container policy.
   need(proof.signaturePolicy==='authority-cleared-unsigned-container'&&proof.chainDer===undefined&&proof.signedAt===undefined);
  }
  const input=Buffer.from(JSON.stringify({xml:accepted.toString('base64'),pdf:candidate.toString('base64'),certs:certs.map(b=>b.toString('base64')),at:signedAt,validator,mode,uuid:record.uuid}));
  const run=spawnSync(pythonExecutable,[script,'verify-archive'],{input,timeout:290000,maxBuffer:1024*1024});
  need(!run.error&&run.status===0);
  const actual=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(run.stdout));
  need(actual?.status==='independent-archive-verified'&&actual.pdfDigest===pdfDigest&&actual.xmlDigest===xmlDigest&&actual.mode===mode&&actual.uuid===record.uuid&&HEX.test(actual.validationDigest??''));
  return {valid:true,xmlDigest,pdfDigest,validationDigest:sha(Buffer.from(JSON.stringify({...binding,validationDigest:actual.validationDigest,interoperabilityDigest:proof.interoperabilityDigest,authorityXmlValidationDigest:proof.authorityXmlValidationDigest,signaturePolicy:proof.signaturePolicy,leafDigest:certs.length?sha(certs[0]):null,signedAt})))};
 };
}
