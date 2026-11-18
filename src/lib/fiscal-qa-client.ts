import {currentCloudIdToken,currentCloudUser} from '../cloud/firebase.js';
import {activeAccountStorageUid} from '../storage/db.js';
declare const firebase:any;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const STATES=['checking','restart-required','checks-complete','operational-request-held','operational-recorded'];
export interface FiscalQaStatus{environment:'simulation';workspaceId:string;unitActive:boolean;onboarding:null|{state:string;version:number;passed:number;required:number};capabilities:{enrollment:boolean;approval:boolean;preparation:boolean;submission:boolean};}
export type FiscalQaCommand={operation:'inspect'}|{operation:'enroll';otp:string}|{operation:'check'|'operational';expectedVersion:number};
export function fiscalQaClientEnabled():boolean{
  try{return typeof firebase.app().options.projectId==='string'&&/^[a-z][a-z0-9-]{0,18}-fiscal-qa$/.test(firebase.app().options.projectId)&&Boolean(currentCloudUser()?.uid)&&currentCloudUser()?.uid===activeAccountStorageUid();}catch{return false;}
}
export function validateFiscalQaStatus(value:any,workspaceId:string):FiscalQaStatus{
  const o=value?.onboarding,c=value?.capabilities;
  if(value?.environment!=='simulation'||value.workspaceId!==workspaceId||typeof value.unitActive!=='boolean'||!c||['enrollment','approval','preparation','submission'].some(k=>typeof c[k]!=='boolean')||o!==null&&(!o||!STATES.includes(o.state)||!Number.isSafeInteger(o.version)||o.version<1||!Number.isSafeInteger(o.passed)||!Number.isSafeInteger(o.required)||o.passed<0||o.passed>o.required||![3,6].includes(o.required)))throw Error('FISCAL_INVALID_STATUS');
  return {environment:'simulation',workspaceId,unitActive:value.unitActive,onboarding:o===null?null:{state:o.state,version:o.version,passed:o.passed,required:o.required},capabilities:{enrollment:c.enrollment,approval:c.approval,preparation:c.preparation,submission:c.submission}};
}
export function fiscalQaNextAction(value:FiscalQaStatus):'enroll'|'check'|'operational'|null{
  if(value.unitActive||!value.capabilities.enrollment)return null;
  if(!value.onboarding)return 'enroll';
  if(value.onboarding.state==='checking'&&value.onboarding.passed<value.onboarding.required)return 'check';
  if(value.onboarding.state==='checks-complete'&&value.onboarding.passed===value.onboarding.required)return 'operational';
  return null;
}
export async function requestFiscalQa(workspaceId:string,command:FiscalQaCommand,signal?:AbortSignal):Promise<FiscalQaStatus|null>{
  const uid=currentCloudUser()?.uid;
  if(!fiscalQaClientEnabled()||!uid||!ID.test(workspaceId))throw Error('FISCAL_QA_UNAVAILABLE');
  if(command.operation==='enroll'&&!/^\d{6}$/.test(command.otp))throw Error('FISCAL_INVALID_OTP');
  if((command.operation==='check'||command.operation==='operational')&&(!Number.isSafeInteger(command.expectedVersion)||command.expectedVersion<1))throw Error('FISCAL_INVALID_VERSION');
  const controller=new AbortController();let stop:(reason:unknown)=>void=()=>{};
  const cancelled=new Promise<never>((_,reject)=>{stop=reject;});
  const cancel=()=>{controller.abort();stop(Error('FISCAL_REQUEST_INTERRUPTED'));};
  if(signal?.aborted)throw Error('FISCAL_REQUEST_INTERRUPTED');
  signal?.addEventListener('abort',cancel,{once:true});
  const timer=window.setTimeout(cancel,45000);
  const check=()=>{if(controller.signal.aborted||currentCloudUser()?.uid!==uid||activeAccountStorageUid()!==uid||!fiscalQaClientEnabled())throw Error('FISCAL_ACCOUNT_CHANGED');};
  try{
    const work=(async()=>{
      check();const token=await currentCloudIdToken(controller.signal);check();
      const response=await fetch('/api/fiscal-command',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice',Authorization:'Bearer '+token},body:JSON.stringify({workspaceId,...command}),signal:controller.signal,cache:'no-store'});
      const value=await response.json();check();
      if(!response.ok||value?.environment!=='simulation')throw Error('FISCAL_COMMAND_NOT_CONFIRMED');
      if(command.operation==='inspect')return validateFiscalQaStatus(value,workspaceId);
      if(!STATES.includes(value.state)||!Number.isSafeInteger(value.version)||value.version<1)throw Error('FISCAL_INVALID_RESULT');
      // Never treat a command response as the authoritative enrollment state.
      // The caller must refresh from the committed snapshot before another action.
      return null;
    })();
    return await Promise.race([work,cancelled]);
  }finally{window.clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
