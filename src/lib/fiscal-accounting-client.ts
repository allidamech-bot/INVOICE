import {currentCloudIdToken,currentCloudUser} from '../cloud/firebase.js';
import {activeAccountStorageUid} from '../storage/db.js';
import {fiscalQaClientEnabled} from './fiscal-qa-client.js';
export interface FiscalAccountingRow{key:string;source:'sale'|'purchase';number:string;date:string;category:string;rate:string;currency:string;kind:string;net:string;vat:string;deductibleVat:string;}
export interface FiscalAccountingReport{environment:'simulation';format:'fiscal-accounting-preview-v1';from:string;to:string;currency:'SAR';outputVat:string;inputVat:string;deductibleVat:string;netVat:string;unmatched:number;rows:FiscalAccountingRow[];readyForFiling:false;}
const money=(v:any)=>typeof v==='string'&&/^-?\d{1,22}\.\d{2}$/.test(v);
export async function requestFiscalAccounting(workspaceId:string,command:{operation:'vat-report';from:string;to:string}|{operation:'post-purchase';purchaseId:string},signal:AbortSignal):Promise<FiscalAccountingReport|null>{
 const uid=currentCloudUser()?.uid;if(!uid||!fiscalQaClientEnabled()||!workspaceId||signal.aborted)throw Error('FISCAL_ACCOUNTING_UNAVAILABLE');
 const token=await currentCloudIdToken(signal);const check=()=>{if(signal.aborted||currentCloudUser()?.uid!==uid||activeAccountStorageUid()!==uid)throw Error('FISCAL_ACCOUNT_CHANGED');};check();
 const r=await fetch('/api/fiscal-command',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice'},body:JSON.stringify({workspaceId,...command}),signal,cache:'no-store'});const v=await r.json();check();
 if(!r.ok||v?.environment!=='simulation')throw Error('FISCAL_ACCOUNTING_UNAVAILABLE');
 if(command.operation==='post-purchase'){if(v.status!=='posted'||v.key!=='purchase-'+command.purchaseId)throw Error('FISCAL_POSTING_INVALID');return null;}
 if(v.format!=='fiscal-accounting-preview-v1'||v.from!==command.from||v.to!==command.to||v.currency!=='SAR'||v.readyForFiling!==false||!['outputVat','inputVat','deductibleVat','netVat'].every(k=>money(v[k]))||!Number.isSafeInteger(v.unmatched)||v.unmatched<0||!Array.isArray(v.rows)||v.rows.length>1000||v.rows.some((x:any)=>!x||typeof x.key!=='string'||!['sale','purchase'].includes(x.source)||typeof x.number!=='string'||typeof x.date!=='string'||!['S','Z','E','O'].includes(x.category)||typeof x.currency!=='string'||!money(x.net)||!money(x.vat)||!money(x.deductibleVat)))throw Error('FISCAL_REPORT_INVALID');
 return v as FiscalAccountingReport;
}
