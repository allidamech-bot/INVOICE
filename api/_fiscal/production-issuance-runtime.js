import {createFiscalLedger} from './ledger.js';
import {createCommercialReview} from './commercial-review.js';
import {createCommercialIssueApproval} from './commercial-approval.js';
import {createCommercialFiscalPreparation} from './commercial-preparation.js';
import {createFiscalProductionWorker} from './simulation-worker.js';
import {createProductionSdk4LocalValidator} from './sdk4-local-validator.js';
import {createFiscalAccounting} from './fiscal-accounting.js';
import {createFiscalOutputService} from './fiscal-output.js';
import {issuanceBoundary} from './issuance-boundary.js';
import {createFiscalReconciler} from './reconciliation.js';
import {createProductionPreparedVerifier,createProductionAuthorityResultVerifier} from './production-issue-verification.js';
import {createFiscalResponseStatus} from './response-status.js';
// Internal trusted composition only. No live endpoint or deployment switch.
export function createProductionIssuanceRuntime({db,productionAuthority,resolveCredential,resolveProtectedSession,verifyPdf,sdk,canonicalize,policy,clearance}){
  if(!productionAuthority||[resolveCredential,resolveProtectedSession,verifyPdf,canonicalize].some(f=>typeof f!=='function')||!policy)throw Error('PRODUCTION_ISSUANCE_NOT_CONFIGURED');
  const options={productionAuthority,sdkInstallationManifestSha256:sdk?.manifestSha256};
  issuanceBoundary(db,options);
  const ledger=createFiscalLedger(db,options);
  const verifyPrepared=createProductionPreparedVerifier({db,authority:productionAuthority,manifestSha256:sdk.manifestSha256,canonicalize,policy});
  const verifyAuthorityResult=createProductionAuthorityResultVerifier({db,authority:productionAuthority,ledger,clearance});
  const validateOfficial=createProductionSdk4LocalValidator({...sdk,canonicalize});
  const review=createCommercialReview({db,...options}),approve=createCommercialIssueApproval({db,...options});
  const prepare=createCommercialFiscalPreparation({db,ledger,canonicalize,validateOfficial,resolveProtectedSession,policy,...options});
  const worker=createFiscalProductionWorker({ledger,productionAuthority,resolveCredential,verifyPrepared,verifyAuthorityResult});
  const accounting=createFiscalAccounting({db,...options}),output=createFiscalOutputService({db,verifyPdf,...options});
  const responseStatus=createFiscalResponseStatus(db,options);
  const reconcile=createFiscalReconciler({ledger,productionAuthority,resolveCredential,verifyPrepared,verifyAuthorityResult});
  const recover=async(scope,id,version)=>{
    const base=issuanceBoundary(db,options).base(scope),r=await db.doc(base+'/issues/'+id).get();
    if(!r.exists||r.data().version!==version||typeof r.data().attemptId!=='string')throw Error('FISCAL_RECOVERY_NOT_ELIGIBLE');
    return ledger.recoverInterrupted(scope,id,version,r.data().attemptId,new Date().toISOString());
  };
  return Object.freeze({review,approve,prepare,submit:worker,recover,reconcile,responseStatus,postSale:accounting.postSale,output});
}
