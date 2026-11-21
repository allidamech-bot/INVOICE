import {createHash} from 'node:crypto';
import {normalizeSdk4Proof} from './sdk4-local-validator.js';
const HEX=/^[a-f0-9]{64}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=ok=>{if(!ok)throw Error('FISCAL_OFFICIAL_VALIDATION_REQUIRED');};
export function sdkProofArtifact(proof,record,manifestPin){
 if(proof===undefined){need(manifestPin===undefined);return null;}
 const normalized=normalizeSdk4Proof(proof,record);
 need(manifestPin===undefined||manifestPin===normalized.installationManifestSha256);
 const bytes=Buffer.from(JSON.stringify(normalized));
 return {sha256:sha(bytes),bytes:bytes.toString('base64')};
}
export async function readStoredSdkProof(db,tx,path,record,manifestPin){
 if(record.sdkValidationDigest===undefined){need(manifestPin===undefined);return null;}
 need(typeof record.sdkValidationDigest==='string'&&HEX.test(record.sdkValidationDigest));
 const row=await tx.get(db.doc(path+'/artifacts/sdk-validation')),a=row.exists?row.data():null;
 need(a&&a.sha256===record.sdkValidationDigest&&typeof a.bytes==='string'&&a.bytes.length<=8192);
 const bytes=Buffer.from(a.bytes,'base64');
 need(bytes.length>0&&bytes.toString('base64')===a.bytes&&sha(bytes)===a.sha256);
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),normalized=sdkProofArtifact(value,record,manifestPin);
 need(normalized.sha256===a.sha256&&normalized.bytes===a.bytes);
 return value;
}
