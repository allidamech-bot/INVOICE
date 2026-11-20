import {createHash,createPublicKey} from 'node:crypto';
import {crc32c} from './managed-kms.js';
import {fiscalCompanySourceDigest,parseProductionProfileCommand} from './production-profile.js';
const ID=/^[A-Za-z0-9_-]{1,128}$/,HEX=/^[a-f0-9]{64}$/;
const KEY=/^projects\/([a-z][a-z0-9-]+)\/locations\/[a-z0-9-]+\/keyRings\/[A-Za-z0-9_-]+\/cryptoKeys\/[A-Za-z0-9_-]+\/cryptoKeyVersions\/[1-9][0-9]*$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const data=s=>s.exists?s.data():null;
const need=(ok,code='PRODUCTION_PROVISIONING_NOT_VERIFIED')=>{if(!ok)throw Error(code);};
const id=v=>typeof v==='string'&&ID.test(v);
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&Buffer.byteLength(v)<=250&&!/[\x00-\x1f\x7f]/.test(v);
// Private operator composition: no browser route, no key creation, no assertion
// that a paid HSM is configured. Independently verified taxpayer eligibility
// remains required by authority.registerUnit. A customer request is not approval.
export function createProductionRegistrationCoordinator({db,loadWorkspace,authority,kmsProjectId,getAccessToken,fetchImpl=fetch}){
 need(typeof db?.runTransaction==='function'&&typeof db?.doc==='function'&&typeof loadWorkspace==='function'&&typeof authority?.registerUnit==='function'&&typeof getAccessToken==='function'&&typeof fetchImpl==='function'&&typeof kmsProjectId==='string'&&!kmsProjectId.endsWith('-fiscal-qa'));
 return async function register(identity,input){
  need(identity?.role==='owner'&&id(identity.uid)&&input&&Object.keys(input).length===7&&['workspaceId','branchId','keyVersion','eligibilityEvidenceDigest','effectiveFrom','organizationUnit','expectedProfileVersion'].every(k=>Object.hasOwn(input,k))&&id(input.workspaceId)&&id(input.branchId)&&Number.isSafeInteger(input.expectedProfileVersion)&&input.expectedProfileVersion>0&&typeof input.keyVersion==='string'&&input.keyVersion.length<=768&&KEY.exec(input.keyVersion)?.[1]===kmsProjectId&&HEX.test(input.eligibilityEvidenceDigest??'')&&text(input.organizationUnit)&&typeof input.effectiveFrom==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom));
  const accountUid=identity.uid,workspaceId=input.workspaceId,branchId=input.branchId;
  const egsId='egs-'+sha(JSON.stringify([accountUid,workspaceId,branchId])).slice(0,40);
  const scope={environment:'production',accountUid,workspaceId,egsId};
  const root='fiscalProductionV1/'+accountUid+'/workspaces/'+workspaceId;
  const {company,profile,request,branch}=await db.runTransaction(async tx=>{
   const w=await loadWorkspace(tx,{accountUid,workspaceId}),profile=data(await tx.get(db.doc(root+'/profiles/current'))),request=data(await tx.get(db.doc(root+'/provisioningRequests/'+branchId)));
   const branch=w.branches.find(b=>b.id===branchId&&b.workspaceId===workspaceId&&b.active===true);
   need(branch&&profile?.environment==='production'&&profile.accountUid===accountUid&&profile.workspaceId===workspaceId&&profile.state==='pending-verification'&&profile.version===input.expectedProfileVersion&&profile.sourceDigest===fiscalCompanySourceDigest(w.company),'PRODUCTION_PROFILE_CHANGED');
   need(request?.environment==='production'&&request.accountUid===accountUid&&request.workspaceId===workspaceId&&request.branchId===branchId&&request.profileVersion===profile.version&&request.sourceDigest===profile.sourceDigest&&['pending','registered'].includes(request.state)&&(request.state==='pending'?request.egsId===undefined:request.egsId===egsId),'PRODUCTION_REGISTRATION_REQUEST_REQUIRED');
   parseProductionProfileCommand({operation:'save',workspaceId,expectedVersion:profile.version,details:profile.details});
   return {company:w.company,profile,request,branch};
  });
  need(/^3\d{13}3$/.test(company.vatNumber.trim())&&text(company.nameAr.trim())&&profile.details.sellerIdScheme==='CRN'&&/^\d{10}$/.test(company.commercialRegistration.trim())&&['1000','0100','1100'].includes(request.functionalityMap)&&text(request.businessCategory));
  if(company.vatNumber.trim()[10]==='1')need(/^\d{10}$/.test(input.organizationUnit),'CSR_GROUP_TIN_REQUIRED');
  // Inspect only the already provisioned non-exportable public key directly
  // from KMS; never accept a caller's protection level or public-key digest.
  const token=await getAccessToken();need(typeof token==='string'&&token.length>0&&token.length<=8192&&/^[A-Za-z0-9._~+\/-]+=*$/.test(token));
  const response=await fetchImpl('https://cloudkms.googleapis.com/v1/'+input.keyVersion+'/publicKey',{headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
  need(response.status===200&&response.body?.getReader,'PRODUCTION_HSM_NOT_VERIFIED');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const v=await reader.read();if(v.done)break;size+=v.value.byteLength;if(size>16384){await reader.cancel();need(false,'PRODUCTION_HSM_NOT_VERIFIED');}chunks.push(Buffer.from(v.value));}}finally{reader.releaseLock();}
  const p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  need(p.name===input.keyVersion&&p.algorithm==='EC_SIGN_SECP256K1_SHA256'&&['HSM','HSM_SINGLE_TENANT'].includes(p.protectionLevel)&&typeof p.pem==='string'&&p.pem.length<=4096&&String(crc32c(Buffer.from(p.pem)))===String(p.pemCrc32c),'PRODUCTION_HSM_NOT_VERIFIED');
  const key=createPublicKey(p.pem);
  need(key.asymmetricKeyType==='ec'&&key.asymmetricKeyDetails?.namedCurve==='secp256k1','PRODUCTION_HSM_NOT_VERIFIED');
  const registeredAddress=[profile.details.buildingNumber,profile.details.street,profile.details.district,company.city.trim(),profile.details.postalCode].join(', ');
  need(text(registeredAddress));
  const issuer={accountUid,workspaceId,issuerCountry:'SA',saRegime:'phase-2',vatNumber:company.vatNumber.trim(),legalName:company.nameAr.trim(),profileVersion:profile.version,effectiveFrom:input.effectiveFrom};
  const unit={egsId,serialNumber:'1-LOUREX|2-INVOICE|3-'+egsId,commonName:'LOUREX-'+egsId,organizationUnit:input.organizationUnit,registeredAddress,functionalityMap:request.functionalityMap,businessCategory:request.businessCategory};
  const binding={...scope,keyVersion:input.keyVersion,publicKeyDigest:sha(key.export({format:'der',type:'spki'})),protectionLevel:p.protectionLevel};
  // Authority rechecks exact source, independent eligibility, bound key
  // registry and pending request atomically before recording the unit.
  return authority.registerUnit(identity,{scope,branchId,issuer,unit,binding,eligibilityEvidenceDigest:input.eligibilityEvidenceDigest});
 };
}
