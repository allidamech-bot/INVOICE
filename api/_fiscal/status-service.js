// Read-only status projection over signed-in synthetic QA accounts.
// Never return XML, credentials, evidence, or internal authority responses.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const STATUSES=new Set(['queued','submitting','uncertain','retryable','rejected','cleared','reported']);
const DIGEST=/^[a-f0-9]{64}$/;
function identifier(value){if(typeof value!=='string'||!ID.test(value))throw Error('INVALID_FISCAL_ID');return value;}
export function createFiscalStatusService(db){
  if(!db||typeof db.doc!=='function'||typeof db.runTransaction!=='function')throw Error('FISCAL_STATUS_UNAVAILABLE');
  return async function status(identity,request){
    if(identity?.role!=='owner')throw Error('FISCAL_STATUS_FORBIDDEN');
    const uid=identifier(identity.uid),workspaceId=identifier(request.workspaceId),documentId=identifier(request.documentId);
    const base='fiscalPrivateV1/'+uid+'/workspaces/'+workspaceId;
    return db.runTransaction(async tx=>{
      const workspace=await tx.get(db.doc(base));
      const config=workspace.exists?workspace.data():null;
      if(!config||config.accountUid!==uid||config.workspaceId!==workspaceId||config.environment!=='simulation'||config.syntheticOnly!==true||config.statusReadEnabled!==true)throw Error('FISCAL_STATUS_FORBIDDEN');
      const issue=await tx.get(db.doc(base+'/issues/'+documentId));
      if(!issue.exists)return {environment:'simulation',documentId,status:'not-prepared'};
      const record=issue.data();
      if(record.accountUid!==uid||record.workspaceId!==workspaceId||record.documentId!==documentId||typeof record.egsId!=='string'||!ID.test(record.egsId)||!STATUSES.has(record.status)||!['clearance','reporting'].includes(record.mode)||!Number.isSafeInteger(record.version)||record.version<1||typeof record.warnings!=='boolean')throw Error('FISCAL_STATUS_UNAVAILABLE');
      const egs=await tx.get(db.doc(base+'/egs/'+record.egsId));
      const unit=egs.exists?egs.data():null;
      if(!unit||unit.accountUid!==uid||unit.workspaceId!==workspaceId||unit.egsId!==record.egsId||unit.environment!=='simulation')throw Error('FISCAL_STATUS_UNAVAILABLE');
      if(record.status==='cleared'&&(record.mode!=='clearance'||typeof record.clearedArtifactDigest!=='string'||!DIGEST.test(record.clearedArtifactDigest)))throw Error('FISCAL_STATUS_UNAVAILABLE');
      if(record.status==='reported'&&record.mode!=='reporting')throw Error('FISCAL_STATUS_UNAVAILABLE');
      return {environment:'simulation',documentId,status:record.status,mode:record.mode,version:record.version,warnings:record.warnings};
    });
  };
}
