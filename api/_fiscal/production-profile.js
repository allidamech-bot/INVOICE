import {createHash} from 'node:crypto';

// Customer intake only: no eligibility, authority, certificate or issuance approval.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const SCHEMES=['CRN','MOM','MLS','700','SAG','OTH'];
const SA=new Set(['sa','sau','saudi arabia','kingdom of saudi arabia','السعودية','المملكة العربية السعودية']);
const id=v=>typeof v==='string'&&ID.test(v);
const data=s=>s.exists?s.data():null;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function need(ok,code='INVALID_FISCAL_PROFILE'){if(!ok)throw Error(code);}
const DETAIL_KEYS=['street','district','buildingNumber','postalCode','sellerIdScheme','otherSellerId'];
function exactKeys(obj,keys){return obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).length===keys.length&&keys.every(k=>Object.hasOwn(obj,k));}
function field(v,max){need(typeof v==='string'&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v));return v.trim();}
export function parseProductionProfileCommand(v){
  need(v&&id(v.workspaceId));
  if(v.operation==='inspect'){need(exactKeys(v,['operation','workspaceId']));return {operation:'inspect',workspaceId:v.workspaceId};}
  need(v.operation==='save'&&exactKeys(v,['operation','workspaceId','expectedVersion','details'])&&Number.isSafeInteger(v.expectedVersion)&&v.expectedVersion>=0&&exactKeys(v.details,DETAIL_KEYS));
  const d=v.details;
  const details={street:field(d.street,250),district:field(d.district,250),buildingNumber:field(d.buildingNumber,4),postalCode:field(d.postalCode,5),sellerIdScheme:field(d.sellerIdScheme,3),otherSellerId:field(d.otherSellerId,80)};
  need(details.street&&details.district&&/^\d{4}$/.test(details.buildingNumber)&&/^\d{5}$/.test(details.postalCode)&&SCHEMES.includes(details.sellerIdScheme));
  need(details.sellerIdScheme==='CRN'?details.otherSellerId==='':/^[A-Za-z0-9]{1,80}$/.test(details.otherSellerId));
  return {operation:'save',workspaceId:v.workspaceId,expectedVersion:v.expectedVersion,details};
}
function companyIdentity(c){
  need(c&&typeof c==='object','FISCAL_PROFILE_FORBIDDEN');
  const result={};for(const k of ['country','nameAr','nameEn','vatNumber','commercialRegistration','addressAr','city']){
    need(typeof c[k]==='string'&&c[k].length<=2000,'FISCAL_COMPANY_INCOMPLETE');result[k]=c[k].trim();
  }
  return result;
}
export function fiscalCompanySourceDigest(company){return hash(companyIdentity(company));}
function readiness(c){
  return {saudiCountry:SA.has(c.country.toLowerCase()),legalName:!!c.nameAr,vatFormat:/^3\d{13}3$/.test(c.vatNumber),city:!!c.city};
}
function projection(workspaceId,c,prior){
  return {environment:'production',workspaceId,version:prior?.version??0,state:!prior?'not-started':prior.sourceDigest===hash(c)?'pending-verification':'profile-changed',checks:readiness(c),details:prior?.details??null,regime:'unresolved',onboardingAvailable:false,issuanceEnabled:false};
}
export function createProductionFiscalProfileService({db,loadCompany,clock=()=>new Date().toISOString()}){
  need(typeof db?.doc==='function'&&typeof db?.runTransaction==='function'&&typeof loadCompany==='function'&&typeof clock==='function','FISCAL_PROFILE_UNAVAILABLE');
  return async function execute(identity,input){
    const cmd=parseProductionProfileCommand(input);
    need(identity?.role==='owner'&&id(identity.uid),'FISCAL_PROFILE_FORBIDDEN');
    const accountUid=identity.uid,workspaceId=cmd.workspaceId;
    const ref=db.doc('fiscalProductionV1/'+accountUid+'/workspaces/'+workspaceId+'/profiles/current');
    return db.runTransaction(async tx=>{
      // A browser company ID is a selector, never membership or issuer proof.
      const company=companyIdentity(await loadCompany(tx,{accountUid,workspaceId}));
      const prior=data(await tx.get(ref));
      if(prior){
        need(prior.environment==='production'&&prior.accountUid===accountUid&&prior.workspaceId===workspaceId&&prior.state==='pending-verification'&&Number.isSafeInteger(prior.version)&&prior.version>0&&/^[a-f0-9]{64}$/.test(prior.sourceDigest)&&exactKeys(prior.details,DETAIL_KEYS),'FISCAL_PROFILE_LOCKED');
        parseProductionProfileCommand({operation:'save',workspaceId,expectedVersion:prior.version,details:prior.details});
      }
      if(cmd.operation==='inspect')return projection(workspaceId,company,prior);
      need((prior?.version??0)===cmd.expectedVersion,'FISCAL_PROFILE_STALE');
      need(Object.values(readiness(company)).every(Boolean),'FISCAL_COMPANY_INCOMPLETE');
      const details=cmd.details;
      if(company.commercialRegistration)need(details.sellerIdScheme==='CRN'&&/^[A-Za-z0-9]{1,80}$/.test(company.commercialRegistration),'FISCAL_SELLER_ID_REQUIRED');
      else need(details.sellerIdScheme!=='CRN','FISCAL_SELLER_ID_REQUIRED');
      const sourceDigest=hash(company);
      if(prior?.sourceDigest===sourceDigest&&hash(prior.details)===hash(details))return projection(workspaceId,company,prior);
      const at=clock();need(typeof at==='string'&&Number.isFinite(Date.parse(at))&&new Date(at).toISOString()===at,'FISCAL_PROFILE_UNAVAILABLE');
      need((prior?.version??0)<Number.MAX_SAFE_INTEGER,'FISCAL_PROFILE_LOCKED');
      const next={environment:'production',accountUid,workspaceId,state:'pending-verification',version:(prior?.version??0)+1,sourceDigest,details,updatedAt:at};
      if(prior)tx.update(ref,next);else tx.create(ref,next);
      return projection(workspaceId,company,next);
    });
  };
}
