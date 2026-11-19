import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {simulationBase} from './simulation-scope.js';
import {hashCanonicalInvoice} from './fiscal-artifacts.js';

export const SDK4_ARCHIVE_SHA256='0e6f62f85c4f5d5da78dba7a9ec90566721e7efeef05dfb4514a159a8e66b1b9';
const HEX=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const KIND=/^(standard|simplified)-(invoice|credit|debit|prepayment)$/;
const script=fileURLToPath(new URL('../../scripts/fiscal/sdk_validate_one.py',import.meta.url));
const need=ok=>{if(!ok)throw Error('FISCAL_OFFICIAL_VALIDATION_REQUIRED');};
const sha=b=>createHash('sha256').update(b).digest('hex');
const keys=['format','sdkVersion','sdkArchiveSha256','installationManifestSha256','kind','uuid','xmlSha256','logSha256','stages'];
export function normalizeSdk4Proof(proof,record){
  need(proof&&Object.keys(proof).length===keys.length&&keys.every(k=>Object.hasOwn(proof,k))&&proof.format==='LOUREX_SDK4_VALIDATION_V1'&&proof.sdkVersion==='4.0.0'&&proof.sdkArchiveSha256===SDK4_ARCHIVE_SHA256&&HEX.test(proof.installationManifestSha256??'')&&HEX.test(proof.logSha256??'')&&KIND.test(proof.kind??'')&&UUID.test(proof.uuid??'')&&proof.uuid===record.uuid&&proof.xmlSha256===record.artifactDigest&&HEX.test(proof.xmlSha256??'')&&['clearance','reporting'].includes(record.mode)&&proof.kind.startsWith(record.mode==='clearance'?'standard-':'simplified-'));
  const required=['XSD','EN','KSA','PIH',...(record.mode==='reporting'?['QR','SIGNATURE']:[])];
  need(Array.isArray(proof.stages)&&proof.stages.length<=16&&proof.stages.every(x=>typeof x==='string'&&/^[A-Z]{1,32}$/.test(x))&&new Set(proof.stages).size===proof.stages.length&&required.every(x=>proof.stages.includes(x)));
  return Object.fromEntries(keys.map(k=>[k,k==='stages'?[...proof.stages].sort():proof[k]]));
}
// Configuration is supplied only by the trusted simulation service operator.
// The exact installation manifest must be independently generated/approved
// from the official archive, never from a browser or a request parameter.
export function createSdk4LocalValidator({pythonExecutable,installationRoot,manifestPath,manifestSha256,javaHome,canonicalize}={}){
  need([pythonExecutable,installationRoot,manifestPath,javaHome].every(p=>typeof p==='string'&&isAbsolute(p))&&HEX.test(manifestSha256??'')&&typeof canonicalize==='function');
  return async function validateOfficial({scope,mode,invoice,bytes,invoiceHash}){
    simulationBase(scope);
    const type=({'invoice':'invoice','credit-note':'credit','debit-note':'debit','prepayment':'prepayment'})[invoice?.kind];
    const category=mode==='clearance'?'standard':mode==='reporting'?'simplified':null;
    need(category&&type&&invoice.mode===category&&UUID.test(invoice.uuid??'')&&Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=512*1024);
    const xml=Buffer.from(bytes),kind=category+'-'+type;
    need(hashCanonicalInvoice(canonicalize(Buffer.from(xml),'invoice'))===invoiceHash);
    const run=spawnSync(pythonExecutable,['-E','-s',script,'--kind',kind,'--root',installationRoot,'--manifest',manifestPath,'--manifest-sha',manifestSha256,'--java-home',javaHome],{input:xml,timeout:180000,maxBuffer:65536});
    need(!run.error&&run.status===0);
    const proof=normalizeSdk4Proof(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(run.stdout)),{uuid:invoice.uuid,mode,artifactDigest:sha(xml)});
    need(proof.kind===kind&&proof.installationManifestSha256===manifestSha256);
    return proof;
  };
}
