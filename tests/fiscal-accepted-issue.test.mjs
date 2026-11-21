import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAcceptedFiscalReader} from '../api/_fiscal/accepted-issue.js';
import {createFiscalOutputService} from '../api/_fiscal/fiscal-output.js';
import {writeAuthorityEvidence} from '../api/_fiscal/authority-evidence.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const scope={environment:'simulation',accountUid:'owner',workspaceId:'company',egsId:'unit'},documentId='doc',uuid='11111111-1111-4111-8111-111111111111';
const base='fiscalPrivateV1/owner/workspaces/company',path=base+'/issues/doc',eventPath=path+'/events/3';
const submitted=Buffer.from('synthetic submitted XML'),cleared=Buffer.from('synthetic cleared XML'),snapshot=Buffer.from('synthetic snapshot');
function fixture(reporting=false){
  const rows=new Map(),db={doc:path=>({path}),runTransaction:fn=>fn({get:async ref=>({exists:rows.has(ref.path),data:()=>structuredClone(rows.get(ref.path))})})};
  const put=(p,v)=>rows.set(p,structuredClone(v));
  const body={validationResults:{status:'PASS',errorMessages:[],warningMessages:[]},...(reporting?{reportingStatus:'REPORTED'}:{clearanceStatus:'CLEARED',clearedInvoice:cleared.toString('base64')}),padding:'x'.repeat(700000)};
  const evidence=Buffer.from(JSON.stringify(body)),status=reporting?'reported':'cleared',at='2026-11-18T10:00:00.000Z';
  const record={...scope,documentId,uuid,mode:reporting?'reporting':'clearance',status,version:3,attemptId:'attempt',updatedAt:at,warnings:false,artifactDigest:sha(submitted),snapshotDigest:sha(snapshot),resultDigest:sha(evidence),clearedArtifactDigest:reporting?null:sha(cleared)};
  put(base,{accountUid:scope.accountUid,workspaceId:scope.workspaceId,environment:'simulation',syntheticOnly:true});
  put(base+'/egs/unit',{...scope,active:true});
  put(path,record);put('fiscalPrivateV1/owner/uuidIndex/'+uuid,{workspaceId:'company',documentId,egsId:'unit'});put(base+'/outbox/doc',{documentId,uuid,egsId:'unit',version:3,state:'closed'});
  put(eventPath,{version:3,status,kind:status,attemptId:'attempt',at,resultDigest:record.resultDigest});
  for(const [name,b] of [['prepared',submitted],['snapshot',snapshot],['cleared',cleared]])put(path+'/artifacts/'+name,{sha256:sha(b),bytes:b.toString('base64')});
  writeAuthorityEvidence({create:(ref,v)=>put(ref.path,v)},db,db.doc(eventPath+'/artifacts/result'),evidence,sha(evidence));
  const read=createAcceptedFiscalReader(db);return {db,rows,put,record,evidence,read:(s=scope,id=documentId)=>read(s,id)};
}
test('accepted standard resolves exact cleared XML, immutable original and chunked evidence',async()=>{
  const f=fixture(),a=await f.read();assert.deepEqual(a.xml,cleared);assert.deepEqual(a.submitted,submitted);assert.deepEqual(a.snapshot,snapshot);assert.deepEqual(a.evidence,f.evidence);a.xml.fill(0);assert.deepEqual((await f.read()).xml,cleared);
});
test('accepted simplified resolves the original reported bytes',async()=>{const f=fixture(true);assert.deepEqual((await f.read()).xml,submitted);});
test('cross tenant, other unit, production, nonexistent and pending records fail closed',async()=>{
  const f=fixture();for(const patch of [{accountUid:'other'},{workspaceId:'other'},{egsId:'other'},{environment:'production'}])await assert.rejects(f.read({...scope,...patch}));await assert.rejects(f.read(scope,'absent'));
  for(const status of ['queued','uncertain','submitting','rejected']){f.put(path,{...f.record,status});await assert.rejects(f.read());}
});
test('persisted workspace and EGS must be synthetic simulation context even after acceptance',async()=>{
  for(const [p,patch] of [[base,{syntheticOnly:false}],[base,{environment:'production'}],[base+'/egs/unit',{environment:'production'}],[base+'/egs/unit',{egsId:'other'}]]){const f=fixture();f.put(p,{...f.rows.get(p),...patch});await assert.rejects(f.read(),/scope mismatch/);}
});
test('tampered record, artifact, queue, index, event and evidence fail closed',async()=>{
  for(const [p,patch] of [[path,{warnings:true}],[path,{mode:'reporting'}],[path+'/artifacts/cleared',{bytes:Buffer.from('bad').toString('base64')}],[path+'/artifacts/snapshot',{sha256:'0'.repeat(64)}],[base+'/outbox/doc',{state:'hold'}],['fiscalPrivateV1/owner/uuidIndex/'+uuid,{egsId:'other'}],[eventPath,{attemptId:'other'}],[eventPath,{unverifiedEvidenceDigest:'bad'}],[eventPath+'/artifacts/result/chunks/1',{index:0}]]){const f=fixture();f.put(p,{...f.rows.get(p),...patch});await assert.rejects(f.read());}
});

test('authenticated artifact service serves exact immutable accepted XML and refuses missing PDF or another revision',async()=>{
 const f=fixture(),at=f.record.updatedAt,bytes=Buffer.from(JSON.stringify({document:{id:documentId,revision:1},generatedAt:at,source:{revision:'123456789012',sha256:'a'.repeat(64),generation:1,reviewDigest:'b'.repeat(64)}})),digest=sha(bytes);
 f.put(base,{...f.rows.get(base),commandsEnabled:true});
 f.put(base+'/issueIntents/'+documentId,{...scope,documentId,state:'approved',documentRevision:1,generatedAt:at,sha256:digest,bytes:bytes.toString('base64')});
 f.put(path,{...f.record,snapshotDigest:digest});f.put(path+'/artifacts/snapshot',{sha256:digest,bytes:bytes.toString('base64')});
 const output=createFiscalOutputService({db:f.db}),result=await output.read(scope,documentId,1,'xml');
 assert.equal(result.format,'xml');assert.equal(result.sha256,sha(cleared));assert.deepEqual(Buffer.from(result.bytes,'base64'),cleared);
 await assert.rejects(output.read(scope,documentId,2,'xml'));await assert.rejects(output.read(scope,documentId,1,'pdf'));await assert.rejects(output.read({...scope,environment:'production'},documentId,1,'xml'));
 await assert.rejects(output.archivePdf(scope,documentId,1,Buffer.from('%PDF-test')));
 const pdf=Buffer.from('%PDF-1.7 synthetic fixture');
 const invalid=createFiscalOutputService({db:f.db,verifyPdf:async()=>({valid:false})});await assert.rejects(invalid.archivePdf(scope,documentId,1,pdf),/FISCAL_PDF_NOT_VERIFIED/);
 // A synthetic verifier cannot establish compliance; this tests only storage binding.
 f.db.runTransaction=fn=>fn({get:async ref=>({exists:f.rows.has(ref.path),data:()=>structuredClone(f.rows.get(ref.path))}),create:(ref,v)=>{assert(!f.rows.has(ref.path));f.put(ref.path,v);}});
 const archive=createFiscalOutputService({db:f.db,verifyPdf:async({record})=>{assert.equal(record.environment,'simulation');return {valid:true,pdfDigest:sha(pdf),xmlDigest:sha(cleared),validationDigest:'c'.repeat(64)};}});
 await archive.archivePdf(scope,documentId,1,pdf);assert.deepEqual(Buffer.from((await output.read(scope,documentId,1,'pdf')).bytes,'base64'),pdf);
 f.put(path+'/artifacts/verifiedPdf/data/pdf',{sha256:sha(pdf),bytes:Buffer.from('tampered').toString('base64')});await assert.rejects(output.read(scope,documentId,1,'pdf'));
});

test('accepted reader supplies verified simulation scope for historical issue records lacking environment',async()=>{
 const f=fixture(),{environment,...legacy}=f.record;f.put(path,legacy);
 assert.equal((await f.read()).record.environment,'simulation');
 f.put(path,{...legacy,environment:'production'});await assert.rejects(f.read());
});
