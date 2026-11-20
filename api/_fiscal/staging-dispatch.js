import {simulationBase,readSimulationContext} from './simulation-scope.js';
import {stagingKeyLocator,STAGING_PROTECTION} from './softhsm-staging-signer.js';
import {readApprovedIntent} from './issue-intent.js';
const ID=/^[A-Za-z0-9_-]{1,128}$/,HEX=/^[a-f0-9]{64}$/;
const data=s=>s.exists?s.data():null;
const need=ok=>{if(!ok)throw Error('FISCAL_STAGING_DISPATCH_DENIED');};
const same=(a,b)=>a&&b&&['environment','accountUid','workspaceId','egsId'].every(k=>a[k]===b[k]);
export async function readStagingContext(db,tx,scope,{active=false}={}){
 const context=await readSimulationContext(db,tx,scope,{active}),{base,workspace,unit}=context;
 const config=data(await tx.get(db.doc(base+'/egs/'+scope.egsId+'/enrollment/config')));
 need(workspace.commandsEnabled===true&&workspace.selectedEgsId===scope.egsId&&same(config,scope)&&config.state==='approved'&&config.pilotAuthorized===true&&config.issuer?.accountUid===scope.accountUid&&config.issuer?.workspaceId===scope.workspaceId&&config.unit?.egsId===scope.egsId);
 if(config.keyBinding!==undefined){
  const b=config.keyBinding;
  need(same(b,scope)&&b.protectionLevel===STAGING_PROTECTION&&b.keyVersion===stagingKeyLocator(scope).keyVersion&&HEX.test(b.publicKeyDigest??''));
 }
 return {...context,config};
}
export function createStagingDispatchRequest({db,clock=()=>new Date().toISOString()}){
 need(typeof db?.runTransaction==='function'&&typeof db?.doc==='function');
 // Only call after the existing authenticated owner command service. Its
 // selected EGS and version are checked again transactionally, not trusted.
 return async function enqueue(scope,documentId,expectedVersion){
  const base=simulationBase(scope);need(typeof documentId==='string'&&ID.test(documentId)&&Number.isSafeInteger(expectedVersion)&&expectedVersion>0);
  const ref=db.doc(base+'/outbox/'+documentId);
  return db.runTransaction(async tx=>{
   const {config}=await readStagingContext(db,tx,scope,{active:true});need(config.keyBinding);
   const issue=data(await tx.get(db.doc(base+'/issues/'+documentId))),queue=data(await tx.get(ref));
   const intent=readApprovedIntent(await tx.get(db.doc(base+'/issueIntents/'+documentId)),scope,documentId);
   need(issue&&['accountUid','workspaceId','egsId'].every(k=>issue[k]===scope[k])&&(issue.environment===undefined||issue.environment==='simulation')&&issue.documentId===documentId&&issue.status==='queued'&&issue.version===expectedVersion&&queue?.documentId===documentId&&queue.egsId===scope.egsId&&queue.uuid===issue.uuid&&queue.version===expectedVersion&&queue.state==='ready'&&intent.digest===issue.snapshotDigest&&HEX.test(issue.sdkValidationDigest??'')&&HEX.test(issue.artifactDigest??''));
   const request={...scope,documentId,uuid:issue.uuid,version:expectedVersion,artifactDigest:issue.artifactDigest,snapshotDigest:issue.snapshotDigest,requestedBy:scope.accountUid};
   if(queue.dispatch){
    need(queue.dispatchState==='requested'&&Object.keys(request).every(k=>queue.dispatch[k]===request[k]));
   }else{
    const requestedAt=clock();need(typeof requestedAt==='string'&&new Date(requestedAt).toISOString()===requestedAt);
    tx.update(ref,{dispatchState:'requested',dispatch:{...request,requestedAt}});
   }
   return {documentId,status:issue.status,version:issue.version};
  });
 };
}
// Outbound polling only. Use the durable ledger claim as the exclusive lease.
// No retry of a held or uncertain network operation, even after restart.
export function createStagingDispatchWorker({db,ledger,submit,reconcile,clock=()=>new Date().toISOString()}){
 need(typeof db?.collection==='function'&&typeof db?.runTransaction==='function'&&typeof ledger?.recoverInterrupted==='function'&&typeof submit==='function'&&typeof reconcile==='function');
 return async function cycle(scope){
  const base=simulationBase(scope);await db.runTransaction(tx=>readStagingContext(db,tx,scope,{active:true}));
  const counters={submitted:0,recovered:0,reconciled:0,held:0,failed:0};
  // Query one scope at a time. No global scan or arbitrary user-supplied path.
  for(const state of ['requested','claimed','held']){
   const page=await db.collection(base+'/outbox').where('dispatchState','==',state).where('egsId','==',scope.egsId).limit(32).get();
   for(const row of page.docs){
    try{
     const job=row.data(),d=job.dispatch;
     need(same(d,scope)&&row.id===d.documentId&&d.documentId===job.documentId&&job.egsId===scope.egsId&&job.uuid===d.uuid&&job.dispatchState===state);
     if(state==='requested'){
      need(job.state==='ready'&&job.version===d.version);
      await submit(scope,d.documentId,d.version);counters.submitted++;
      continue;
     }
     const snap=await db.doc(base+'/issues/'+d.documentId).get(),issue=data(snap);
     need(issue&&['accountUid','workspaceId','egsId'].every(k=>issue[k]===scope[k])&&issue.uuid===d.uuid&&issue.artifactDigest===d.artifactDigest&&issue.snapshotDigest===d.snapshotDigest&&issue.version===job.version&&job.state==='hold'&&typeof issue.attemptId==='string');
     if(state==='claimed'){
      need(issue.status==='submitting');
      const receipt=await ledger.readResponse(scope,d.documentId,issue.version,issue.attemptId);
      if(Date.parse(clock())-Date.parse(receipt.startedAt)>=300000){
       await ledger.recoverInterrupted(scope,d.documentId,issue.version,issue.attemptId,clock());counters.recovered++;
      }else counters.held++;
     }else{
      need(issue.status==='uncertain');
      const receipt=await ledger.readResponse(scope,d.documentId,issue.version-1,issue.attemptId);
      if(!receipt.receipt){counters.held++;continue;}
      const result=await reconcile(scope,d.documentId,issue.version);
      if(['cleared','reported'].includes(result.status))counters.reconciled++;else counters.held++;
     }
    }catch{counters.failed++;}
   }
  }
  return counters;
 };
}
