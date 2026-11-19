import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sdkProofArtifact,readStoredSdkProof} from '../api/_fiscal/sdk4-validation-evidence.js';
import {SDK4_ARCHIVE_SHA256} from '../api/_fiscal/sdk4-local-validator.js';
import {createAcceptedFiscalReader} from '../api/_fiscal/accepted-issue.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const scope={environment:'simulation',accountUid:'owner',workspaceId:'company',egsId:'egs'},base='fiscalPrivateV1/owner/workspaces/company',path=base+'/issues/doc',uuid='11111111-1111-4111-8111-111111111111';
const xml=Buffer.from('synthetic XML'),snapshot=Buffer.from('synthetic approved snapshot'),body=Buffer.from(JSON.stringify({validationResults:{status:'PASS',errorMessages:[],warningMessages:[]},reportingStatus:'REPORTED'})),pin='a'.repeat(64),at='2026-11-19T10:00:00.000Z';
const encode=bytes=>({sha256:sha(bytes),bytes:bytes.toString('base64')});
function fixture(){
 const record={accountUid:scope.accountUid,workspaceId:scope.workspaceId,egsId:scope.egsId,documentId:'doc',mode:'reporting',status:'reported',version:3,uuid,artifactDigest:sha(xml),snapshotDigest:sha(snapshot),attemptId:'attempt',updatedAt:at,warnings:false,resultDigest:sha(body),clearedArtifactDigest:null};
 const proof={format:'LOUREX_SDK4_VALIDATION_V1',sdkVersion:'4.0.0',sdkArchiveSha256:SDK4_ARCHIVE_SHA256,installationManifestSha256:pin,kind:'simplified-invoice',uuid,xmlSha256:record.artifactDigest,logSha256:'b'.repeat(64),stages:['EN','KSA','PIH','QR','SIGNATURE','XSD']};
 const artifact=sdkProofArtifact(proof,record,pin),rows=new Map([[base,{...scope,syntheticOnly:true}],[base+'/egs/egs',{...scope,active:true}],[path,{...record,sdkValidationDigest:artifact.sha256}],['fiscalPrivateV1/owner/uuidIndex/'+uuid,{workspaceId:'company',documentId:'doc',egsId:'egs'}],[base+'/outbox/doc',{documentId:'doc',uuid,egsId:'egs',version:3,state:'closed'}],[path+'/events/3',{version:3,status:'reported',kind:'reported',resultDigest:record.resultDigest,at,attemptId:'attempt'}],[path+'/artifacts/prepared',encode(xml)],[path+'/artifacts/snapshot',encode(snapshot)],[path+'/events/3/artifacts/result',encode(body)],[path+'/artifacts/sdk-validation',artifact]]);
 const tx={get:async ref=>({exists:rows.has(ref.path),data:()=>structuredClone(rows.get(ref.path))})},db={doc:p=>({path:p}),runTransaction:fn=>fn(tx)};
 return {db,tx,rows,record,proof,artifact};
}
test('stored proof must match immutable XML and the independently pinned installation',async()=>{
 const f=fixture(),r=f.rows.get(path),ref=path+'/artifacts/sdk-validation';
 assert.deepEqual(await readStoredSdkProof(f.db,f.tx,path,r,pin),f.proof);
 await assert.rejects(readStoredSdkProof(f.db,f.tx,path,r,'c'.repeat(64)));
 await assert.rejects(readStoredSdkProof(f.db,f.tx,path,{...r,artifactDigest:'d'.repeat(64)},pin));
 f.rows.set(ref,{...f.artifact,bytes:Buffer.from('changed').toString('base64')});await assert.rejects(readStoredSdkProof(f.db,f.tx,path,r,pin));
 f.rows.delete(ref);await assert.rejects(readStoredSdkProof(f.db,f.tx,path,r,pin));
 await assert.rejects(readStoredSdkProof(f.db,f.tx,path,f.record,pin));
 assert.equal(await readStoredSdkProof(f.db,f.tx,path,f.record),null);
 assert.throws(()=>sdkProofArtifact(undefined,f.record,pin));
});
test('accepted reader passes proven simulation scope to PDF and rejects corrupt SDK evidence',async()=>{
 const f=fixture(),read=createAcceptedFiscalReader(f.db),a=await read(scope,'doc');
 assert.equal(a.record.environment,'simulation');assert.deepEqual(a.xml,xml);
 f.rows.set(path+'/artifacts/sdk-validation',{...f.artifact,bytes:'YmFk'});await assert.rejects(read(scope,'doc'));
 f.rows.set(path,f.record);assert.equal((await read(scope,'doc')).record.environment,'simulation');
 f.rows.set(path,{...f.record,environment:'production'});await assert.rejects(read(scope,'doc'));
});
