import {randomBytes} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {loadCompiledFinance} from './compiled-finance-loader.js';
const [{closedPeriodState,assertClosedPeriodUnchanged},{assertPostedStockRestoreContinuity},{isIsoDate}]=await Promise.all([
  loadCompiledFinance('period'),
  loadCompiledFinance('backup'),
  loadCompiledFinance('id')
]);
import {validatePeriodCommand,validateMeta,decodeWorkspace,decodeReport,encodeWorkspace,encodeBytes,hexId,hash,fail,PeriodError} from './period-format.js';

const newId=()=>randomBytes(16).toString('hex');
const chunkId=(revision,index)=>'chunk-'+revision+'-'+String(index).padStart(5,'0');
function controlValue(snapshot,uid){
  const value=snapshot.data();
  if(!snapshot.exists)fail(428,'PERIOD_ENROLLMENT_REQUIRED');
  if(value?.format!=='LOUREX_PERIOD_CONTROL_V1'||value.version!==1||value.ownerUid!==uid
    ||!Number.isSafeInteger(value.generation)||value.generation<1||!Array.isArray(value.boundaries)
    ||value.boundaries.some(b=>!b||typeof b.workspaceId!=='string'||typeof b.through!=='string'||!isIsoDate(b.through)||!hexId(b.reportId))
    ||new Set(value.boundaries.map(b=>b.workspaceId)).size!==value.boundaries.length)fail(422,'INVALID_PERIOD_CONTROL');
  return value;
}
function receiptValue(snapshot,fingerprint){
  if(!snapshot.exists)return null;const value=snapshot.data();
  if(value.fingerprint!==fingerprint)fail(409,'OPERATION_REUSED');
  if(!value.result||!Number.isSafeInteger(value.result.generation))fail(422,'INVALID_OPERATION_RECEIPT');
  return value.result;
}

// A missing control document is not proof that an enrolled financial period never
// existed. The immutable operation/report records are independent server evidence.
// Never resurrect an enrolled account with generation=1 after control loss.
// An orphaned pre-transaction periodGenerations chunk is deliberately NOT evidence:
// failed first enrollment attempts can leave those harmless chunks behind.
async function assertNoLostAuthority(root,readQuery){
  for(const collectionName of ['periodOperations','periodReports']){
    const found=await readQuery(root.collection(collectionName).limit(1));
    if(!found.empty)fail(503,'PERIOD_AUTHORITY_MISSING');
  }
}

/** db is a server Firestore instance. No browser reference/token supplies authority. */
export function createPeriodService(db){
  async function readPayload(root,meta,staged=false){
    validateMeta(meta);const chunks=[];
    for(let start=0;start<meta.chunkCount;start+=8){
      const refs=Array.from({length:Math.min(8,meta.chunkCount-start)},(_,i)=>staged
        ?root.collection('chunks').doc(String(start+i).padStart(5,'0'))
        :(meta.chunkStorage==='period-generations-v1'
          ?root.collection('periodGenerations').doc(meta.revision).collection('chunks')
          :root.collection('workspace')).doc(chunkId(meta.revision,start+i)));
      for(const doc of await db.getAll(...refs))chunks.push(doc.exists?doc.data():null);
    }
    return decodeWorkspace(meta,chunks);
  }
  async function createChunks(collection,revision,chunks){
    // Only new server generations are written. Never edit or delete an old chunk.
    for(let start=0;start<chunks.length;start+=12){
      const batch=db.batch();for(const chunk of chunks.slice(start,start+12))batch.create(collection.doc(chunkId(revision,chunk.index)),chunk);
      await batch.commit();
    }
  }
  async function assertPublishedState(root,payload,boundaries){
    for(const boundary of boundaries){
      const ref=root.collection('periodReports').doc(boundary.reportId),report=(await ref.get()).data();
      // Validate metadata bounds before reading a client-influenced count.
      if(!report||!Number.isSafeInteger(report.chunkCount)||report.chunkCount<1||report.chunkCount>750)fail(422,'INVALID_PUBLISHED_REPORT');
      const chunks=[];for(let start=0;start<report.chunkCount;start+=8){
        const refs=Array.from({length:Math.min(8,report.chunkCount-start)},(_,i)=>ref.collection('chunks').doc(chunkId(boundary.reportId,start+i)));
        for(const doc of await db.getAll(...refs))chunks.push(doc.exists?doc.data():null);
      }
      decodeReport(report,chunks,boundary);
      let candidate;try{candidate=closedPeriodState(payload,boundary);}catch{fail(422,'PERIOD_CHANGED');}
      if(hash(Buffer.from(JSON.stringify(candidate)))!==report.sha256)fail(422,'PERIOD_CHANGED');
    }
  }
  return{async execute(identity,raw){
    if(identity?.role!=='owner'||typeof identity.uid!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(identity.uid))fail(403,'PERIOD_OWNER_REQUIRED');
    const input=validatePeriodCommand(raw),fingerprint=hash(JSON.stringify(input));
    const root=db.collection('users').doc(identity.uid),metaRef=root.collection('workspace').doc('meta'),controlRef=root.collection('accounting').doc('control');
    const operationRef=root.collection('periodOperations').doc(input.opId);
    if(input.operation==='inspect')return db.runTransaction(async tx=>{
      const [metaDoc,controlDoc]=await tx.getAll(metaRef,controlRef),meta=validateMeta(metaDoc.data());
      const control=controlDoc.exists?controlValue(controlDoc,identity.uid):null;
      if(!control){
        // A server-owned manifest proves prior enrollment even when every
        // operation/report document has also been lost.
        if(meta.chunkStorage==='period-generations-v1')fail(503,'PERIOD_AUTHORITY_MISSING');
        await assertNoLostAuthority(root,query=>tx.get(query));
      }
      return {format:'LOUREX_PERIOD_STATUS_V1',version:1,enrolled:Boolean(control),revision:meta.revision,sha256:meta.sha256,generation:control?.generation??0,boundaries:control?.boundaries??[]};
    });
    const previousResult=receiptValue(await operationRef.get(),fingerprint);
    if(previousResult){
      // Idempotent receipts are valid only while their owner control survives.
      // Never report success from an archived receipt after loss of authority.
      const current=await controlRef.get();
      if(!current.exists)fail(503,'PERIOD_AUTHORITY_MISSING');
      controlValue(current,identity.uid);
      return previousResult;
    }
    if(input.operation==='enroll'){
      const controlBefore=await controlRef.get();
      if(controlBefore.exists)fail(409,'ALREADY_ENROLLED');
      await assertNoLostAuthority(root,query=>query.get());
      const initial=validateMeta((await metaRef.get()).data());
      if(initial.chunkStorage==='period-generations-v1')fail(503,'PERIOD_AUTHORITY_MISSING');
      if(initial.revision!==input.expectedRevision||input.expectedGeneration!==0){
        const prior=receiptValue(await operationRef.get(),fingerprint);if(prior)return prior;fail(409,'REVISION_CONFLICT');
      }
      // Verify the entire legacy generation BEFORE creating the barrier. Copy
      // to a namespace clients cannot write even before enrollment, so a racing
      // legacy chunk edit cannot corrupt the adopted, verified generation.
      const adopted=encodeWorkspace(await readPayload(root,initial),newId());
      const adoptedMeta={...adopted.meta,parentRevision:initial.revision,chunkStorage:'period-generations-v1'};
      await createChunks(root.collection('periodGenerations').doc(adoptedMeta.revision).collection('chunks'),adoptedMeta.revision,adopted.chunks);
      return db.runTransaction(async tx=>{
      const [receipt,metaDoc,controlDoc]=await tx.getAll(operationRef,metaRef,controlRef);
      const prior=receiptValue(receipt,fingerprint);
      if(prior){
        if(!controlDoc.exists)fail(503,'PERIOD_AUTHORITY_MISSING');
        controlValue(controlDoc,identity.uid);
        return prior;
      }
      if(controlDoc.exists)fail(409,'ALREADY_ENROLLED');
      // Repeat the absence-of-history guard transactionally. A competing
      // enrollment must not be mistaken for a pristine account.
      await assertNoLostAuthority(root,query=>tx.get(query));
      const meta=validateMeta(metaDoc.data());
      if(meta.chunkStorage==='period-generations-v1')fail(503,'PERIOD_AUTHORITY_MISSING');
      if(meta.revision!==initial.revision||meta.sha256!==initial.sha256)fail(409,'REVISION_CONFLICT');
      const result={revision:adoptedMeta.revision,generation:1,boundaries:[]};
      tx.create(root.collection('workspaceHistory').doc(meta.revision),{...meta,archivedAt:FieldValue.serverTimestamp()});
      tx.set(metaRef,adoptedMeta);
      tx.create(controlRef,{format:'LOUREX_PERIOD_CONTROL_V1',version:1,ownerUid:identity.uid,generation:1,boundaries:[],enrolledAt:FieldValue.serverTimestamp()});
      tx.create(operationRef,{fingerprint,operation:'enroll',actorUid:identity.uid,at:FieldValue.serverTimestamp(),result});return result;
      });
    }
    const [controlDoc,metaDoc]=await db.getAll(controlRef,metaRef);
    const control=controlValue(controlDoc,identity.uid),meta=validateMeta(metaDoc.data());
    if(control.generation!==input.expectedGeneration||meta.revision!==input.expectedRevision){
      // The identical operation may have committed after the first receipt read.
      const prior=receiptValue(await operationRef.get(),fingerprint);if(prior)return prior;fail(409,'REVISION_CONFLICT');
    }
    if(meta.chunkStorage!=='period-generations-v1')fail(422,'INVALID_WORKSPACE_MANIFEST');
    // Enrolled accounts have immutable published chunks. The final transaction
    // rechecks both control generation and manifest, avoiding long read locks.
    const before=await readPayload(root,meta);
    let nextMeta=meta,boundaries=control.boundaries.map(b=>({...b})),report=null;
    if(input.operation==='commit'){
      const stageRef=root.collection('periodStaging').doc(input.opId),stageDoc=await stageRef.get(),stageMeta=validateMeta(stageDoc.data());
      if(stageMeta.revision!==input.opId)fail(422,'INVALID_STAGE_IDENTITY');
      const candidate=await readPayload(stageRef,stageMeta,true);
      try{assertPostedStockRestoreContinuity(before,candidate);assertClosedPeriodUnchanged(before,candidate,boundaries);}
      catch(error){if(error instanceof PeriodError)throw error;fail(422,'PERIOD_CHANGED');}
      await assertPublishedState(root,candidate,boundaries);
      const encoded=encodeWorkspace(candidate,newId());nextMeta={...encoded.meta,parentRevision:meta.revision,chunkStorage:'period-generations-v1'};
      await createChunks(root.collection('periodGenerations').doc(nextMeta.revision).collection('chunks'),nextMeta.revision,encoded.chunks);
    }else if(input.operation==='close'){
      await assertPublishedState(root,before,boundaries);
      const current=boundaries.find(b=>b.workspaceId===input.workspaceId);
      if(current&&current.through>=input.through)fail(422,'INVALID_CLOSE_RANGE');
      let state;try{state=closedPeriodState(before,{workspaceId:input.workspaceId,through:input.through});}catch{fail(422,'INVALID_PERIOD_SOURCE');}
      const reportId=newId(),bytes=Buffer.from(JSON.stringify(state));if(bytes.length>135_000_000)fail(413,'REPORT_TOO_LARGE');
      const encoded=encodeBytes(bytes,reportId);await createChunks(root.collection('periodReports').doc(reportId).collection('chunks'),reportId,encoded.chunks);
      report={reportId,format:'LOUREX_PERIOD_REPORT_V1',version:1,workspaceId:input.workspaceId,through:input.through,
        sourceRevision:meta.revision,bytes:encoded.bytes,sha256:encoded.sha256,chunkCount:encoded.chunkCount};
      boundaries=[...boundaries.filter(b=>b.workspaceId!==input.workspaceId),{workspaceId:input.workspaceId,through:input.through,reportId}];
    }else{
      if(!boundaries.some(b=>b.workspaceId===input.workspaceId))fail(422,'PERIOD_NOT_CLOSED');
      // Reopening must not discard the last active close boundary if a
      // disaster/recovery omitted or corrupted its retained report. A report
      // file from a local backup is evidence, not trusted server authority.
      await assertPublishedState(root,before,boundaries);
      boundaries=boundaries.filter(b=>b.workspaceId!==input.workspaceId);
    }
    boundaries.sort((a,b)=>a.workspaceId<b.workspaceId?-1:a.workspaceId>b.workspaceId?1:0);
    const result={revision:nextMeta.revision,generation:control.generation+1,boundaries,...(report?{reportId:report.reportId}:{})};
    return db.runTransaction(async tx=>{
      const [receipt,latestControl,latestMeta]=await tx.getAll(operationRef,controlRef,metaRef);
      const prior=receiptValue(receipt,fingerprint);
      if(prior){
        if(!latestControl.exists)fail(503,'PERIOD_AUTHORITY_MISSING');
        controlValue(latestControl,identity.uid);
        return prior;
      }
      const verifiedControl=controlValue(latestControl,identity.uid),verifiedMeta=validateMeta(latestMeta.data());
      if(verifiedControl.generation!==control.generation||verifiedMeta.revision!==meta.revision||verifiedMeta.sha256!==meta.sha256)fail(409,'REVISION_CONFLICT');
      if(input.operation==='commit'){
        tx.create(root.collection('workspaceHistory').doc(meta.revision),{...meta,archivedAt:FieldValue.serverTimestamp()});
        tx.set(metaRef,nextMeta);
      }
      if(report)tx.create(root.collection('periodReports').doc(report.reportId),{...report,actorUid:identity.uid,reason:input.reason,publishedAt:FieldValue.serverTimestamp()});
      tx.set(controlRef,{...verifiedControl,generation:result.generation,boundaries,updatedAt:FieldValue.serverTimestamp()});
      tx.create(operationRef,{fingerprint,operation:input.operation,actorUid:identity.uid,reason:input.reason||'',workspaceId:input.workspaceId||'',at:FieldValue.serverTimestamp(),result});
      return result;
    });
  }};
}
