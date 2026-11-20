import {currentCloudIdToken,currentCloudUser} from '../cloud/firebase.js';
import {activeAccountStorageUid} from '../storage/db.js';
declare const firebase:any;
export type SellerIdScheme='CRN'|'MOM'|'MLS'|'700'|'SAG'|'OTH';
export interface ProductionProfileDetails{street:string;district:string;buildingNumber:string;postalCode:string;sellerIdScheme:SellerIdScheme;otherSellerId:string;}
export interface ProductionProfileStatus{environment:'production';workspaceId:string;version:number;registrationLocked:boolean;state:'not-started'|'pending-verification'|'profile-changed';checks:{saudiCountry:boolean;legalName:boolean;vatFormat:boolean;city:boolean};details:ProductionProfileDetails|null;regime:'unresolved';onboardingAvailable:false;issuanceEnabled:false;}
export type ProductionProfileCommand={operation:'inspect'}|{operation:'save';expectedVersion:number;details:ProductionProfileDetails};
const schemes=['CRN','MOM','MLS','700','SAG','OTH'];
const scope=/^[A-Za-z0-9_-]{1,128}$/;
export function fiscalProductionProfileClientEnabled():boolean{try{return firebase.app().options.projectId==='lourex-invoice'&&Boolean(currentCloudUser()?.uid)&&currentCloudUser()?.uid===activeAccountStorageUid();}catch{return false;}}
export function validateProductionProfileStatus(v:any,workspaceId:string):ProductionProfileStatus{
  const d=v?.details,checks=v?.checks;
  if(v?.environment!=='production'||v.workspaceId!==workspaceId||!Number.isSafeInteger(v.version)||v.version<0||typeof v.registrationLocked!=='boolean'||v.registrationLocked&&v.version===0||!['not-started','pending-verification','profile-changed'].includes(v.state)||v.regime!=='unresolved'||v.onboardingAvailable!==false||v.issuanceEnabled!==false||!checks||['saudiCountry','legalName','vatFormat','city'].some(k=>typeof checks[k]!=='boolean')||(v.version===0)!==(v.state==='not-started')||(v.version===0)!==(d===null))throw Error('FISCAL_INVALID_STATUS');
  if(d!==null&&(!d||typeof d.street!=='string'||typeof d.district!=='string'||!/^\d{4}$/.test(d.buildingNumber)||!/^\d{5}$/.test(d.postalCode)||!schemes.includes(d.sellerIdScheme)||typeof d.otherSellerId!=='string'))throw Error('FISCAL_INVALID_STATUS');
  return {environment:'production',workspaceId,version:v.version,registrationLocked:v.registrationLocked,state:v.state,checks:{saudiCountry:checks.saudiCountry,legalName:checks.legalName,vatFormat:checks.vatFormat,city:checks.city},details:d===null?null:{street:d.street,district:d.district,buildingNumber:d.buildingNumber,postalCode:d.postalCode,sellerIdScheme:d.sellerIdScheme,otherSellerId:d.otherSellerId},regime:'unresolved',onboardingAvailable:false,issuanceEnabled:false};
}
export async function requestProductionProfile(workspaceId:string,command:ProductionProfileCommand,signal:AbortSignal):Promise<ProductionProfileStatus>{
  const uid=currentCloudUser()?.uid;
  const check=()=>{if(signal.aborted||!uid||currentCloudUser()?.uid!==uid||!fiscalProductionProfileClientEnabled()||!scope.test(workspaceId))throw Error('FISCAL_ACCOUNT_CHANGED');};
  check();const token=await currentCloudIdToken(signal);check();
  const res=await fetch('/api/fiscal-profile',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice',Authorization:'Bearer '+token},body:JSON.stringify({workspaceId,...command}),signal,cache:'no-store'});
  const value=await res.json();check();
  if(!res.ok){const code=value?.code;throw Error(['FISCAL_COMPANY_SYNC_REQUIRED','FISCAL_PROFILE_STALE','FISCAL_COMPANY_INCOMPLETE','FISCAL_SELLER_ID_REQUIRED','FISCAL_PROFILE_LOCKED','FISCAL_PROFILE_FORBIDDEN'].includes(code)?code:'FISCAL_PROFILE_UNAVAILABLE');}
  return validateProductionProfileStatus(value,workspaceId);
}
