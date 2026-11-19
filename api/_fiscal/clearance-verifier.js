import {createHash} from 'node:crypto';
import {hashArtifact} from './fiscal-artifacts.js';

// Internal simulation-only composition. Neither the HTTP status nor content
// matching establishes authority approval. All three trusted checks are required.
const digest=b=>createHash('sha256').update(b).digest('hex');
const cap=512*1024;
export function createStandardClearanceVerifier({verifyContent,verifyStamp,verifyQr}){
  if([verifyContent,verifyStamp,verifyQr].some(f=>typeof f!=='function'))throw Error('CLEARANCE_VERIFIER_NOT_CONFIGURED');
  return async ({scope,record,result,xml})=>{
    try{
      if(scope?.environment!=='simulation'||record?.mode!=='clearance'||['accountUid','workspaceId','egsId'].some(k=>typeof scope[k]!=='string'||!scope[k]||scope[k]!==record[k]))return false;
      if(hashArtifact(xml)!==record.artifactDigest||result?.status!=='clearance-response'||![200,202].includes(result.httpStatus)||typeof result.warnings!=='boolean')return false;
      const evidence=Buffer.from(result.evidenceBytes),cleared=Buffer.from(result.clearedBytes);
      if(!evidence.length||evidence.length>2*1024*1024||!cleared.length||cleared.length>cap||digest(evidence)!==result.evidenceDigest)return false;
      const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(evidence));
      const v=body?.validationResults;
      if(body?.clearanceStatus!=='CLEARED'||body.clearedInvoice!==cleared.toString('base64')||!v||!['PASS','WARNING'].includes(v.status)||!Array.isArray(v.errorMessages)||v.errorMessages.length||!Array.isArray(v.warningMessages)||(v.status==='WARNING'||v.warningMessages.length>0)!==result.warnings)return false;
      const context=Object.freeze({uuid:record.uuid,invoiceHash:record.invoiceHash,scope:Object.freeze({...scope})});
      // Separate byte copies prevent one adapter from mutating another's input.
      if(await verifyContent({...context,submitted:Buffer.from(xml),cleared:Buffer.from(cleared)})!==true)return false;
      if(await verifyStamp({...context,cleared:Buffer.from(cleared)})!==true)return false;
      return await verifyQr({...context,cleared:Buffer.from(cleared)})===true;
    }catch{return false;}
  };
}
