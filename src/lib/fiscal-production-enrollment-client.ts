import {currentCloudIdToken,currentCloudUser} from '../cloud/firebase.js';
import {fiscalProductionProfileClientEnabled} from './fiscal-production-profile-client.js';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const states=['not-started','checking','checks-complete','restart-required','operational-request-held','operational-recorded','unavailable'];
export interface ProductionEnrollmentUnit{egsId:string;branchId:string;state:string;unitActive:boolean;enrollmentHeld:boolean;version:number;passed:number;required:number;}
export interface ProductionEnrollmentStatus{environment:'production';workspaceId:string;available:boolean;registeredUnits:number;units:ProductionEnrollmentUnit[];issuanceEnabled:false;}
export type ProductionEnrollmentCommand={operation:'enrollment-status'}|{operation:'enrollment-begin';egsId:string;otp:string}|{operation:'enrollment-check'|'enrollment-operational'|'enrollment-activate';egsId:string;expectedVersion:number};
export type ProductionEnrollmentAction=Exclude<ProductionEnrollmentCommand['operation'],'enrollment-status'>;
export function validateProductionEnrollmentStatus(v:any,w:string):ProductionEnrollmentStatus{
 if(v?.environment!=='production'||v.workspaceId!==w||typeof v.available!=='boolean'||v.issuanceEnabled!==false||!Number.isInteger(v.registeredUnits)||v.registeredUnits<0||v.registeredUnits>100||!Array.isArray(v.units)||v.units.length!==(v.available?v.registeredUnits:0))throw Error('FISCAL_INVALID_STATUS');
 const units:ProductionEnrollmentUnit[]=v.units.map((u:any)=>{
   if(!u||typeof u.egsId!=='string'||!ID.test(u.egsId)||typeof u.branchId!=='string'||!ID.test(u.branchId)||!states.includes(u.state)||typeof u.unitActive!=='boolean'||typeof u.enrollmentHeld!=='boolean'||!Number.isSafeInteger(u.version)||u.version<0||!Number.isInteger(u.passed)||u.passed<0||u.passed>u.required||!(u.state==='unavailable'?u.required===0&&u.enrollmentHeld&&!u.unitActive:[3,6].includes(u.required))||(u.unitActive&&u.state!=='operational-recorded'))throw Error('FISCAL_INVALID_STATUS');
   return {egsId:u.egsId,branchId:u.branchId,state:u.state,unitActive:u.unitActive,enrollmentHeld:u.enrollmentHeld,version:u.version,passed:u.passed,required:u.required};
 });
 if(new Set(units.map(u=>u.egsId)).size!==units.length)throw Error('FISCAL_INVALID_STATUS');
 return {environment:'production',workspaceId:w,available:v.available,registeredUnits:v.registeredUnits,units,issuanceEnabled:false};
}
export function productionEnrollmentNextAction(s:ProductionEnrollmentStatus,u:ProductionEnrollmentUnit):ProductionEnrollmentAction|null{
 if(!s.available||u.unitActive||u.enrollmentHeld||!s.units.some(x=>x.egsId===u.egsId&&x.version===u.version&&x.state===u.state))return null;
 if(u.state==='not-started'&&u.version===0)return 'enrollment-begin';
 if(u.version<1)return null;
 if(u.state==='checking'&&u.passed<u.required)return 'enrollment-check';
 if(u.state==='checks-complete'&&u.passed===u.required)return 'enrollment-operational';
 if(u.state==='operational-recorded'&&u.passed===u.required)return 'enrollment-activate';
 return null;
}
export async function requestProductionEnrollment(workspaceId:string,command:ProductionEnrollmentCommand,signal:AbortSignal):Promise<ProductionEnrollmentStatus|null>{
 const uid=currentCloudUser()?.uid;
 const check=()=>{if(signal.aborted||!uid||uid!==currentCloudUser()?.uid||!fiscalProductionProfileClientEnabled()||!ID.test(workspaceId))throw Error('FISCAL_ACCOUNT_CHANGED');};
 check();
 if(command.operation!=='enrollment-status'&&!ID.test(command.egsId))throw Error('FISCAL_INVALID_UNIT');
 if(command.operation==='enrollment-begin'&&!/^\d{6}$/.test(command.otp))throw Error('FISCAL_INVALID_OTP');
 if(command.operation!=='enrollment-status'&&command.operation!=='enrollment-begin'&&(!Number.isSafeInteger(command.expectedVersion)||command.expectedVersion<1))throw Error('FISCAL_INVALID_VERSION');
 const token=await currentCloudIdToken(signal);check();
 const response=await fetch('/api/fiscal-profile',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice',Authorization:'Bearer '+token},body:JSON.stringify({workspaceId,...command}),signal,cache:'no-store'});
 const v=await response.json();check();
 if(!response.ok||v?.environment!=='production'||v.workspaceId!==workspaceId)throw Error('FISCAL_ENROLLMENT_NOT_CONFIRMED');
 if(command.operation==='enrollment-status')return validateProductionEnrollmentStatus(v,workspaceId);
 if(v.refreshRequired!==true)throw Error('FISCAL_ENROLLMENT_NOT_CONFIRMED');
 return null;
}
