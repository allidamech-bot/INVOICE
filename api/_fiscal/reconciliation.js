import {classifyStoredSubmissionResponse} from './zatca-simulation.js';
import {hashArtifact} from './fiscal-artifacts.js';

// Explicit server-only positive reconciliation of an already journaled response.
// No submission client, retry, fabricated evidence or negative decision path.
export function createFiscalReconciler({productionAuthority,ledger,resolveCredential,verifyPrepared,verifyAuthorityResult,clock=()=>new Date().toISOString()}){
  if(!ledger||typeof ledger.readHeldForReconciliation!=='function'||typeof ledger.transition!=='function'||[resolveCredential,verifyPrepared,verifyAuthorityResult,clock].some(f=>typeof f!=='function'))throw Error('FISCAL_RECONCILER_NOT_CONFIGURED');
  return async function reconcile(scope,documentId,expectedVersion){
    if(scope?.environment!==(productionAuthority?'production':'simulation'))throw Error('PRODUCTION_DISABLED');
    scope=Object.freeze({...scope});
    const saved=await ledger.readHeldForReconciliation(scope,documentId,expectedVersion);
    const record=Object.freeze({...saved.record,usedAttemptIds:Object.freeze([...saved.record.usedAttemptIds])});
    const held=()=>({documentId,status:record.status,version:record.version});
    if(!saved.receipt)return held();
    const result=classifyStoredSubmissionResponse({httpStatus:saved.receipt.httpStatus,bytes:saved.bytes,mode:record.mode});
    if(result.status!==(record.mode==='clearance'?'clearance-response':'reporting-response'))return held();
    const xml=Buffer.from(saved.xmlBytes),snapshot=Buffer.from(saved.snapshotBytes),evidence=Buffer.from(saved.bytes),cleared=result.clearedBytes?Buffer.from(result.clearedBytes):undefined;
    try{
      const credential=await resolveCredential(scope);
      if(await verifyPrepared({scope,record,xml:Buffer.from(xml),snapshot:Buffer.from(snapshot),credential})!==true)return held();
      if(await verifyAuthorityResult({scope,record,xml:Buffer.from(xml),result:{...result,evidenceBytes:Buffer.from(evidence),...(cleared?{clearedBytes:Buffer.from(cleared)}:{})}})!==true)return held();
      if(productionAuthority)await productionAuthority.recordResult(scope,'submit-'+record.uuid,{digest:result.evidenceDigest,outcome:'verified-pass'});
    }catch{return held();}
    const event={kind:record.mode==='clearance'?'cleared':'reported',attemptId:record.attemptId,at:clock(),resultDigest:result.evidenceDigest,warnings:result.warnings,...(cleared?{clearedArtifactDigest:hashArtifact(cleared)}:{})};
    const next=await ledger.transition(scope,documentId,expectedVersion,event,evidence,cleared);
    return {documentId:next.documentId,status:next.status,version:next.version};
  };
}
