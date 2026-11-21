import {randomUUID} from 'node:crypto';
import {createZatcaSimulationClient,createZatcaProductionClient} from './zatca-simulation.js';
import {hashArtifact} from './fiscal-artifacts.js';
import {hashAuthorityEvidence} from './authority-evidence.js';

// Internal simulation worker only. Trusted services must supply real SDK and
// authority verifiers; no HTTP route, scheduler, credentials or production mode.
function createWorker(environment,{productionAuthority,ledger,resolveCredential,verifyPrepared,verifyAuthorityResult,fetchImpl,clock=()=>new Date().toISOString(),attemptId=()=>randomUUID()}){
  if(!ledger||typeof ledger.claim!=='function'||typeof ledger.transition!=='function'||typeof ledger.recordResponse!=='function'||[resolveCredential,verifyPrepared,verifyAuthorityResult,clock,attemptId].some(f=>typeof f!=='function'))throw Error('FISCAL_WORKER_NOT_CONFIGURED');
  if(environment==='production'&&(!productionAuthority||typeof productionAuthority.reserveAttempt!=='function'||typeof productionAuthority.operationAuthorizer!=='function'||typeof productionAuthority.recordResult!=='function'))throw Error('PRODUCTION_TRANSPORT_NOT_CONFIGURED');
  return async function submitQueued(scope,documentId,expectedVersion){
    if(scope?.environment!==environment)throw Error('PRODUCTION_DISABLED');
    scope=Object.freeze({...scope});
    const simulationClient=environment==='simulation'?createZatcaSimulationClient({environment,authorizedScope:scope,fetchImpl}):null;
    // The transaction owns the attempt before any remote call. Only one worker wins.
    const id=attemptId(), claimed=await ledger.claim(scope,documentId,expectedVersion,id,clock());
    const record=Object.freeze({...claimed.record}), xml=Buffer.from(claimed.xmlBytes), snapshot=Buffer.from(claimed.snapshotBytes);
    let event, evidence, evidenceDigest, cleared, result;
    try{
      const credential=await resolveCredential(scope);
      if(await verifyPrepared({scope,record,xml:Buffer.from(xml),snapshot:Buffer.from(snapshot),credential})!==true)throw Error('PREPARED_ARTIFACT_NOT_VERIFIED');
      let client=simulationClient;
      if(environment==='production'){
        const slot='submit-'+record.uuid;
        await productionAuthority.reserveAttempt(slot,{scope,operation:'submit',mode:record.mode,uuid:record.uuid,invoiceHash:record.invoiceHash,artifactDigest:record.artifactDigest,credentialRequestId:credential.requestId});
        client=createZatcaProductionClient({environment,authorizedScope:scope,authorizeOperation:productionAuthority.operationAuthorizer(scope,slot),fetchImpl});
      }
      result=await client.submit(credential,{uuid:record.uuid,invoiceHash:record.invoiceHash,invoice:xml.toString('base64')},record.mode);
      // Retain the original bounded response even if the verifier rejects it.
      const raw=Buffer.from(result.evidenceBytes);
      const rawDigest=hashAuthorityEvidence(raw);
      if(rawDigest!==result.evidenceDigest)throw Error('EVIDENCE_MISMATCH');
      evidence=raw;evidenceDigest=rawDigest;
    }catch{result=undefined;}
    // No verifier or terminal transition can run if receipt durability fails.
    // The claimed attempt stays on hold; an operator can reconcile it later.
    if(result){
      try{await ledger.recordResponse(scope,documentId,record.version,id,{httpStatus:result.httpStatus,bytes:Buffer.from(evidence),digest:evidenceDigest,receivedAt:clock()});}
      catch{throw Error('FISCAL_RESPONSE_DURABILITY_FAILED');}
    }
    try{
      if(!result)throw Error('AUTHORITY_RESULT_NOT_VERIFIED');
      const raw=evidence;
      if(result.status!==(record.mode==='clearance'?'clearance-response':'reporting-response'))throw Error('AUTHORITY_RESULT_NOT_VERIFIED');
      const candidate=record.mode==='clearance'?Buffer.from(result.clearedBytes):undefined;
      const warnings=result.warnings;
      if(await verifyAuthorityResult({scope,record,result:{...result,evidenceBytes:Buffer.from(raw),...(candidate?{clearedBytes:Buffer.from(candidate)}:{})},xml:Buffer.from(xml)})!==true)throw Error('AUTHORITY_RESULT_NOT_VERIFIED');
      if(environment==='production')await productionAuthority.recordResult(scope,'submit-'+record.uuid,{digest:evidenceDigest,outcome:'verified-pass'});
      if(record.mode==='clearance'){
        cleared=candidate;
        event={kind:'cleared',attemptId:id,at:clock(),resultDigest:evidenceDigest,clearedArtifactDigest:hashArtifact(cleared),warnings};
      }else event={kind:'reported',attemptId:id,at:clock(),resultDigest:evidenceDigest,warnings};
    }catch{
      // Never infer non-acceptance or replay. Even local verification failures
      // require controlled reconciliation; unverified evidence never grants status.
      event={kind:'uncertain',attemptId:id,at:clock(),...(evidenceDigest?{unverifiedEvidenceDigest:evidenceDigest}:{})};cleared=undefined;
    }
    const final=await ledger.transition(scope,documentId,record.version,event,evidence,cleared);
    // No raw evidence, XML, credentials or keys returned by the worker.
    return {documentId:final.documentId,status:final.status,version:final.version};
  };
}

export const createFiscalSimulationWorker=options=>createWorker('simulation',options);
export const createFiscalProductionWorker=options=>createWorker('production',options);
