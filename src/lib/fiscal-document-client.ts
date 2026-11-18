import type {LourexDocument} from '../types.js';
import {currentCloudIdToken,currentCloudUser} from '../cloud/firebase.js';
import {activeAccountStorageUid} from '../storage/db.js';
import {fiscalQaClientEnabled,fiscalQaProjectActive} from './fiscal-qa-client.js';
const STATUSES=['not-reviewed','reviewed','approved','queued','submitting','uncertain','retryable','rejected','cleared','reported'] as const;
export type FiscalDocumentStatus=typeof STATUSES[number];
export interface FiscalReviewFields{invoiceType:'standard'|'simplified';supplyDate:string;paymentMeans:'10'|'30'|'42'|'48'|'1';}
export type FiscalDocumentAction={operation:'document-status'|'approve'|'prepare'}|{operation:'review';fields:FiscalReviewFields}|{operation:'submit';expectedVersion:number};
export interface FiscalDocumentState{status:FiscalDocumentStatus;version:number|null;capabilities:{review:boolean;approval:boolean;preparation:boolean;submission:boolean};}
export function fiscalQaInvoice(doc:Pick<LourexDocument,'kind'|'companySnapshot'>):boolean{
  if(!fiscalQaProjectActive()||doc.kind!=='invoice')return false;
  const c=String(doc.companySnapshot?.country||'').trim().toUpperCase();
  return ['SA','SAU','SAUDI ARABIA','KINGDOM OF SAUDI ARABIA','السعودية','المملكة العربية السعودية'].includes(c)||/^3\d{13}3$/.test(doc.companySnapshot?.vatNumber||'');
}
export function fiscalDocumentNextAction(state:FiscalDocumentState):'review'|'approve'|'prepare'|'submit'|null{
  if(state.status==='not-reviewed'&&state.capabilities.review)return 'review';
  if(state.status==='reviewed'&&state.capabilities.approval)return 'approve';
  if(state.status==='approved'&&state.capabilities.preparation)return 'prepare';
  if(state.status==='queued'&&state.capabilities.submission&&Number.isSafeInteger(state.version)&&Number(state.version)>0)return 'submit';
  return null;
}
export function validateFiscalDocumentState(v:any,doc:Pick<LourexDocument,'id'|'revision'>):FiscalDocumentState{
  if(v?.environment!=='simulation'||v.documentId!==doc.id||v.documentRevision!==doc.revision||!STATUSES.includes(v.status)||!v.capabilities||['review','approval','preparation','submission'].some(k=>typeof v.capabilities[k]!=='boolean')||(['not-reviewed','reviewed','approved'].includes(v.status)?v.version!==null:!Number.isSafeInteger(v.version)||v.version<1))throw Error('FISCAL_INVALID_DOCUMENT_STATUS');
  return {status:v.status,version:v.version,capabilities:{review:v.capabilities.review,approval:v.capabilities.approval,preparation:v.capabilities.preparation,submission:v.capabilities.submission}};
}
export async function requestFiscalDocument(doc:LourexDocument,action:FiscalDocumentAction,signal?:AbortSignal):Promise<FiscalDocumentState|null>{
  const uid=currentCloudUser()?.uid;
  if(!uid||!fiscalQaInvoice(doc)||!fiscalQaClientEnabled()||!doc.workspaceId||doc.status!=='draft')throw Error('FISCAL_DOCUMENT_UNAVAILABLE');
  const controller=new AbortController();let rejectStop:(r:unknown)=>void=()=>{};
  const stopped=new Promise<never>((_,reject)=>{rejectStop=reject;});
  const cancel=()=>{controller.abort();rejectStop(Error('FISCAL_REQUEST_INTERRUPTED'));};
  if(signal?.aborted)throw Error('FISCAL_REQUEST_INTERRUPTED');signal?.addEventListener('abort',cancel,{once:true});
  const timer=window.setTimeout(cancel,45000);
  const check=()=>{if(controller.signal.aborted||uid!==currentCloudUser()?.uid||uid!==activeAccountStorageUid()||!fiscalQaClientEnabled())throw Error('FISCAL_ACCOUNT_CHANGED');};
  try{
    const work=(async()=>{
      check();const token=await currentCloudIdToken(controller.signal);check();
      const extra=action.operation==='review'?action.fields:action.operation==='submit'?{expectedVersion:action.expectedVersion}:{};
      const response=await fetch('/api/fiscal-command',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice',Authorization:'Bearer '+token},body:JSON.stringify({operation:action.operation,workspaceId:doc.workspaceId,documentId:doc.id,documentRevision:doc.revision,...extra}),signal:controller.signal,cache:'no-store'});
      const v=await response.json();check();
      if(!response.ok||v?.environment!=='simulation'||v.documentId!==doc.id)throw Error('FISCAL_DOCUMENT_NOT_CONFIRMED');
      return action.operation==='document-status'?validateFiscalDocumentState(v,doc):null;
    })();return await Promise.race([work,stopped]);
  }finally{window.clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
