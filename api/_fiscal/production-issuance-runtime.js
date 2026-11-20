import {createFiscalLedger} from './ledger.js';
import {createCommercialReview} from './commercial-review.js';
import {createCommercialIssueApproval} from './commercial-approval.js';
import {createCommercialFiscalPreparation} from './commercial-preparation.js';
import {createFiscalProductionWorker} from './simulation-worker.js';
import {createProductionSdk4LocalValidator} from './sdk4-local-validator.js';
import {createFiscalAccounting} from './fiscal-accounting.js';
import {createFiscalOutputService} from './fiscal-output.js';
import {issuanceBoundary} from './issuance-boundary.js';
// Internal trusted composition only. No live endpoint or deployment switch.
export function createProductionIssuanceRuntime({db,productionAuthority,resolveCredential,resolveProtectedSession,verifyPrepared,verifyAuthorityResult,verifyPdf,sdk,canonicalize,policy}){
  if(!productionAuthority||[resolveCredential,resolveProtectedSession,verifyPrepared,verifyAuthorityResult,verifyPdf,canonicalize].some(f=>typeof f!=='function')||!policy)throw Error('PRODUCTION_ISSUANCE_NOT_CONFIGURED');
  const options={productionAuthority,sdkInstallationManifestSha256:sdk?.manifestSha256};
  issuanceBoundary(db,options);
  const ledger=createFiscalLedger(db,options);
  const validateOfficial=createProductionSdk4LocalValidator({...sdk,canonicalize});
  const review=createCommercialReview({db,...options}),approve=createCommercialIssueApproval({db,...options});
  const prepare=createCommercialFiscalPreparation({db,ledger,canonicalize,validateOfficial,resolveProtectedSession,policy,...options});
  const worker=createFiscalProductionWorker({ledger,productionAuthority,resolveCredential,verifyPrepared,verifyAuthorityResult});
  const accounting=createFiscalAccounting({db,...options}),output=createFiscalOutputService({db,verifyPdf,...options});
  return Object.freeze({review,approve,prepare,submit:worker,postSale:accounting.postSale,output});
}
