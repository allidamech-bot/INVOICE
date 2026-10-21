import type {VaultPayload} from '../types.js';
import {closedPeriodState,type ClosedPeriodState} from './period-close.js';
import {isIsoDate} from './id.js';

/** Device preflight cache. Server-owned control and reports remain authoritative. */
export interface LocalPeriodProtection {
  version:1;uid:string;generation:number;
  reports:Array<{workspaceId:string;through:string;reportId:string;state:ClosedPeriodState}>;
}
export function validateLocalPeriodProtection(uid:string,value:LocalPeriodProtection):void{
  if(value?.version!==1||value.uid!==uid||!Number.isSafeInteger(value.generation)||value.generation<1||!Array.isArray(value.reports)
    ||value.reports.some(r=>!r||!r.workspaceId||!isIsoDate(r.through)||!/^[a-f0-9]{32}$/.test(r.reportId)
      ||r.state?.version!==1||r.state.workspaceId!==r.workspaceId||r.state.through!==r.through)
    ||new Set(value.reports.map(r=>r.workspaceId)).size!==value.reports.length)
    throw new Error('Invalid trusted closed period cache. Reconnect before saving.');
}
export function assertLocalPeriodCandidate(uid:string,payload:VaultPayload,protection:LocalPeriodProtection):void{
  validateLocalPeriodProtection(uid,protection);
  for(const report of protection.reports){
    let state:ClosedPeriodState;try{state=closedPeriodState(payload,report);}catch{throw new Error('This edit changes a closed period. Reopen it online before correcting history.');}
    if(JSON.stringify(state)!==JSON.stringify(report.state))throw new Error('This edit changes a closed period. Reopen it online before correcting history.');
  }
}
