import type {LourexDocument} from '../types.js';
import {currentCloudIdToken,currentCloudUser} from '../cloud/firebase.js';
import {activeAccountStorageUid} from '../storage/db.js';
import {fiscalQaClientEnabled,fiscalQaProjectActive} from './fiscal-qa-client.js';
import {fiscalProductionProfileClientEnabled} from './fiscal-production-profile-client.js';
import {needsSaudiFiscalIssuance} from './invoice-mode.js';
const STATUSES=['not-reviewed','reviewed','approved','queued','submitting','uncertain','retryable','rejected','cleared','reported'] as const;
export type FiscalDocumentStatus=typeof STATUSES[number];
export interface FiscalReviewFields{invoiceType:'standard'|'simplified';supplyDate:string;paymentMeans:'10'|'30'|'42'|'48'|'1';}
export type FiscalDocumentAction={operation:'document-status'|'approve'|'prepare'|'post-sale'}|{operation:'review';fields:FiscalReviewFields}|{operation:'submit'|'recover'|'reconcile';expectedVersion:number};
export interface FiscalAuthorityResponse{httpStatus:number;kind:'positive-response'|'validation-errors'|'unresolved-response';warningCount:number;errorCount:number;warningCodes:string[];errorCodes:string[];}
export interface FiscalResponseStatus{mode:'clearance'|'reporting';updatedAt:string;reportingDeadline:string|null;overdue:boolean;hasReceipt:boolean;recoveryAvailable:boolean;acceptedWithWarnings:boolean;response:FiscalAuthorityResponse|null;}
export type FiscalDocumentEnvironment='simulation'|'production';
export interface FiscalDocumentState{commercialPosted?:boolean;status:FiscalDocumentStatus;version:number|null;response:FiscalResponseStatus|null;artifacts:{xml:boolean;pdf:boolean};capabilities:{review:boolean;approval:boolean;preparation:boolean;submission:boolean;recovery:boolean;reconciliation:boolean};}
const iso=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const codeList=(v:any):v is string[]=>Array.isArray(v)&&v.length<=20&&v.every(x=>typeof x==='string'&&/^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(x));
function validateResponseStatus(r:any):FiscalResponseStatus|null{
  if(r===null)return null;
  if(!r||!['clearance','reporting'].includes(r.mode)||!iso(r.updatedAt)||(r.mode==='clearance'?r.reportingDeadline!==null:!iso(r.reportingDeadline))||['overdue','hasReceipt','recoveryAvailable','acceptedWithWarnings'].some(k=>typeof r[k]!=='boolean'))throw Error('FISCAL_INVALID_RESPONSE_STATUS');
  const e=r.response;
  if(e!==null&&(!e||!Number.isInteger(e.httpStatus)||e.httpStatus<100||e.httpStatus>599||!['positive-response','validation-errors','unresolved-response'].includes(e.kind)||!Number.isSafeInteger(e.warningCount)||!Number.isSafeInteger(e.errorCount)||e.warningCount<0||e.errorCount<0||!codeList(e.warningCodes)||!codeList(e.errorCodes)||e.warningCodes.length>e.warningCount||e.errorCodes.length>e.errorCount))throw Error('FISCAL_INVALID_RESPONSE_STATUS');
  if(r.hasReceipt!==Boolean(e))throw Error('FISCAL_INVALID_RESPONSE_STATUS');
  return {mode:r.mode,updatedAt:r.updatedAt,reportingDeadline:r.reportingDeadline,overdue:r.overdue,hasReceipt:r.hasReceipt,recoveryAvailable:r.recoveryAvailable,acceptedWithWarnings:r.acceptedWithWarnings,response:e?{httpStatus:e.httpStatus,kind:e.kind,warningCount:e.warningCount,errorCount:e.errorCount,warningCodes:[...e.warningCodes],errorCodes:[...e.errorCodes]}:null};
}
export function fiscalQaInvoice(doc:Pick<LourexDocument,'kind'|'companySnapshot'|'invoiceMode'>):boolean{
  // The isolated QA flow must never reclassify an explicitly ordinary invoice.
  // Legacy documents without invoiceMode retain their existing treatment;
  // verified server-side invoice review remains mandatory before issuance.
  if(!fiscalQaProjectActive()||doc.kind!=='invoice'||doc.invoiceMode==='ordinary')return false;
  const c=String(doc.companySnapshot?.country||'').trim().toUpperCase();
  return ['SA','SAU','SAUDI ARABIA','KINGDOM OF SAUDI ARABIA','السعودية','المملكة العربية السعودية'].includes(c)||/^3\d{13}3$/.test(doc.companySnapshot?.vatNumber||'');
}
export function fiscalDocumentEnvironment(doc:Pick<LourexDocument,'kind'|'companySnapshot'|'invoiceMode'>):FiscalDocumentEnvironment|null{
  if(fiscalQaInvoice(doc))return 'simulation';
  if(needsSaudiFiscalIssuance(doc))return 'production';
  return null;
}
function fiscalClientEnabled(env:FiscalDocumentEnvironment):boolean{return env==='simulation'?fiscalQaClientEnabled():fiscalProductionProfileClientEnabled()&&!fiscalQaProjectActive();}
const endpoint=(env:FiscalDocumentEnvironment)=>env==='production'?'/api/fiscal-profile':'/api/fiscal-command';
const operation=(env:FiscalDocumentEnvironment,op:string)=>env==='production'?'issuance-'+op:op;
export function fiscalDocumentNextAction(state:FiscalDocumentState):'review'|'approve'|'prepare'|'submit'|'recover'|'reconcile'|null{
  if(state.status==='not-reviewed'&&state.capabilities.review)return 'review';
  if(state.status==='reviewed'&&state.capabilities.approval)return 'approve';
  if(state.status==='approved'&&state.capabilities.preparation)return 'prepare';
  if(state.status==='queued'&&state.capabilities.submission&&Number.isSafeInteger(state.version)&&Number(state.version)>0)return 'submit';
  if(state.status==='submitting'&&state.capabilities.recovery&&state.response?.recoveryAvailable&&state.version)return 'recover';
  if(state.status==='uncertain'&&state.capabilities.reconciliation&&state.response?.hasReceipt&&state.version)return 'reconcile';
  return null;
}
export function validateFiscalDocumentState(v:any,doc:Pick<LourexDocument,'id'|'revision'>,environment:FiscalDocumentEnvironment='simulation'):FiscalDocumentState{
  if(v?.environment!==environment||v.documentId!==doc.id||v.documentRevision!==doc.revision||!STATUSES.includes(v.status)||!v.capabilities||['review','approval','preparation','submission','recovery','reconciliation'].some(k=>typeof v.capabilities[k]!=='boolean')||(['not-reviewed','reviewed','approved'].includes(v.status)?v.version!==null:!Number.isSafeInteger(v.version)||v.version<1))throw Error('FISCAL_INVALID_DOCUMENT_STATUS');
  const response=validateResponseStatus(v.response);
  if(!v.artifacts||typeof v.artifacts.xml!=='boolean'||typeof v.artifacts.pdf!=='boolean'||v.artifacts.pdf&&!v.artifacts.xml||(v.artifacts.xml&&!['cleared','reported'].includes(v.status)))throw Error('FISCAL_INVALID_OUTPUT_STATUS');
  if(v.version===null&&response!==null||v.version!==null&&response===null||response?.acceptedWithWarnings&&!['cleared','reported'].includes(v.status))throw Error('FISCAL_INVALID_RESPONSE_STATUS');
  if(environment==='production'&&(typeof v.commercialPosted!=='boolean'||v.commercialPosted&&!['cleared','reported'].includes(v.status)))throw Error('FISCAL_INVALID_POSTING_STATUS');
  return {...(environment==='production'?{commercialPosted:v.commercialPosted}:{}),status:v.status,version:v.version,response,artifacts:{xml:v.artifacts.xml,pdf:v.artifacts.pdf},capabilities:{review:v.capabilities.review,approval:v.capabilities.approval,preparation:v.capabilities.preparation,submission:v.capabilities.submission,recovery:v.capabilities.recovery,reconciliation:v.capabilities.reconciliation}};
}
export async function requestFiscalDocument(doc:LourexDocument,action:FiscalDocumentAction,signal?:AbortSignal):Promise<FiscalDocumentState|null>{
  const uid=currentCloudUser()?.uid,env=fiscalDocumentEnvironment(doc);
  if(!uid||!env||!fiscalClientEnabled(env)||!doc.workspaceId||(doc.status!=='draft'&&!(env==='production'&&doc.status==='final'&&action.operation==='document-status')))throw Error('FISCAL_DOCUMENT_UNAVAILABLE');
  const controller=new AbortController();let rejectStop:(r:unknown)=>void=()=>{};
  const stopped=new Promise<never>((_,reject)=>{rejectStop=reject;});
  const cancel=()=>{controller.abort();rejectStop(Error('FISCAL_REQUEST_INTERRUPTED'));};
  if(signal?.aborted)throw Error('FISCAL_REQUEST_INTERRUPTED');signal?.addEventListener('abort',cancel,{once:true});
  const timer=window.setTimeout(cancel,45000);
  const check=()=>{if(controller.signal.aborted||uid!==currentCloudUser()?.uid||uid!==activeAccountStorageUid()||!fiscalClientEnabled(env))throw Error('FISCAL_ACCOUNT_CHANGED');};
  try{
    const work=(async()=>{
      check();const token=await currentCloudIdToken(controller.signal);check();
      const extra=action.operation==='review'?action.fields:'expectedVersion' in action?{expectedVersion:action.expectedVersion}:{};
      const response=await fetch(endpoint(env),{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice',Authorization:'Bearer '+token},body:JSON.stringify({operation:operation(env,action.operation),workspaceId:doc.workspaceId,documentId:doc.id,documentRevision:doc.revision,...extra}),signal:controller.signal,cache:'no-store'});
      const v=await response.json();check();
      if(!response.ok||v?.environment!==env||v.documentId!==doc.id||(env==='production'&&v.documentRevision!==doc.revision))throw Error('FISCAL_DOCUMENT_NOT_CONFIRMED');
      return action.operation==='document-status'?validateFiscalDocumentState(v,doc,env):null;
    })();return await Promise.race([work,stopped]);
  }finally{window.clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}

export async function fetchFiscalArtifact(doc:LourexDocument,format:'xml'|'pdf',signal?:AbortSignal):Promise<File>{
  const uid=currentCloudUser()?.uid,env=fiscalDocumentEnvironment(doc);
  if(!uid||!env||!fiscalClientEnabled(env)||!doc.workspaceId||!['xml','pdf'].includes(format))throw Error('FISCAL_DOCUMENT_UNAVAILABLE');
  const controller=new AbortController(),cancel=()=>controller.abort();
  if(signal?.aborted)throw Error('FISCAL_REQUEST_INTERRUPTED');
  signal?.addEventListener('abort',cancel,{once:true});
  const timer=window.setTimeout(cancel,30000);
  const check=()=>{if(controller.signal.aborted||uid!==currentCloudUser()?.uid||uid!==activeAccountStorageUid()||!fiscalClientEnabled(env))throw Error('FISCAL_ACCOUNT_CHANGED');};
  try{
    check();const token=await currentCloudIdToken(controller.signal);check();
    const response=await fetch(endpoint(env),{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice',Authorization:'Bearer '+token},body:JSON.stringify({operation:operation(env,'download'),workspaceId:doc.workspaceId,documentId:doc.id,documentRevision:doc.revision,format}),signal:controller.signal,cache:'no-store'});
    const v=await response.json();check();
    if(!response.ok||v?.environment!==env||v.documentId!==doc.id||v.documentRevision!==doc.revision||v.format!==format||typeof v.bytes!=='string'||v.bytes.length>Math.ceil(2*1024*1024/3)*4||typeof v.filename!=='string'||!new RegExp('^LOUREX-[a-f0-9-]{36}\\.'+format+'$').test(v.filename)||typeof v.sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sha256))throw Error('FISCAL_INVALID_OUTPUT');
    const decoded=atob(v.bytes);if(!decoded.length||decoded.length>2*1024*1024||btoa(decoded)!==v.bytes)throw Error('FISCAL_INVALID_OUTPUT');
    const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');check();
    if(digest!==v.sha256||format==='pdf'&&decoded.slice(0,5)!=='%PDF-')throw Error('FISCAL_INVALID_OUTPUT');
    return new File([bytes],v.filename,{type:format==='xml'?'application/xml':'application/pdf'});
  }finally{window.clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
