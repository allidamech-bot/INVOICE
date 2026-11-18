import {randomUUID} from 'node:crypto';
import {createZatcaSimulationClient} from './zatca-simulation.js';
import {hashArtifact} from './fiscal-artifacts.js';

// Internal simulation worker only. Trusted services must supply real SDK and
// authority verifiers; no HTTP route, scheduler, credentials or production mode.
export function createFiscalSimulationWorker({ledger,resolveCredential,verifyPrepared,verifyAuthorityResult,fetchImpl,clock=()=>new Date().toISOString(),attemptId=()=>randomUUID()}){
  if(!ledger||typeof ledger.claim!=='function'||typeof ledger.transition!=='function'||[resolveCredential,verifyPrepared,verifyAuthorityResult,clock,attemptId].some(f=>typeof f!=='function'))throw Error('FISCAL_WORKER_NOT_CONFIGURED');
  return async function submitQueued(scope,documentId,expectedVersion){
    if(scope?.environment!=='simulation')throw Error('PRODUCTION_DISABLED');
    const client=createZatcaSimulationClient({environment:'simulation',authorizedScope:scope,fetchImpl});
    // The transaction owns the attempt before any remote call. Only one worker wins.
    const id=attemptId(), claimed=await ledger.claim(scope,documentId,expectedVersion,id,clock());
    const record=claimed.record, xml=Buffer.from(claimed.xmlBytes), snapshot=Buffer.from(claimed.snapshotBytes);
    let event, evidence, cleared;
    try{
      const credential=await resolveCredential(scope);
      if(await verifyPrepared({scope,record,xml:Buffer.from(xml),snapshot:Buffer.from(snapshot),credential})!==true)throw Error('PREPARED_ARTIFACT_NOT_VERIFIED');
      const result=await client.submit(credential,{uuid:record.uuid,invoiceHash:record.invoiceHash,invoice:xml.toString('base64')},record.mode);
      if(result.status!==(record.mode==='clearance'?'clearance-response':'reporting-response')||await verifyAuthorityResult({scope,record,result,xml:Buffer.from(xml)})!==true)throw Error('AUTHORITY_RESULT_NOT_VERIFIED');
      evidence=Buffer.from(result.evidenceBytes);
      if(hashArtifact(evidence)!==result.evidenceDigest)throw Error('EVIDENCE_MISMATCH');
      if(record.mode==='clearance'){
        cleared=Buffer.from(result.clearedBytes);
        event={kind:'cleared',attemptId:id,at:clock(),resultDigest:result.evidenceDigest,clearedArtifactDigest:hashArtifact(cleared),warnings:result.warnings};
      }else event={kind:'reported',attemptId:id,at:clock(),resultDigest:result.evidenceDigest,warnings:result.warnings};
    }catch{
      // Never infer non-acceptance or replay. Even local verification failures
      // require controlled reconciliation; a crash leaves a durable hold.
      event={kind:'uncertain',attemptId:id,at:clock()};evidence=undefined;cleared=undefined;
    }
    const final=await ledger.transition(scope,documentId,record.version,event,evidence,cleared);
    // No raw evidence, XML, credentials or keys returned by the worker.
    return {documentId:final.documentId,status:final.status,version:final.version};
  };
}
