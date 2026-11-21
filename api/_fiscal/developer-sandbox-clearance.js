// Developer Portal Integration Sandbox only. This does NOT authenticate a
// taxpayer, verify PKIX or establish a production ZATCA clearance.
import {createHash,timingSafeEqual} from 'node:crypto';

const MAX=512*1024;
const BAD='DEVELOPER_CLEARED_ARTIFACT_UNVERIFIED';
const need=(x,reason='UNVERIFIED')=>{if(!x)throw Error(BAD+'_'+reason);};
const SHA=/^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;
function strict64(v){
 need(typeof v==='string'&&v.length>0&&v.length<=Math.ceil(MAX/3)*4+4&&/^[A-Za-z0-9+/]+={0,2}$/.test(v));
 const b=Buffer.from(v,'base64');need(b.length>0&&b.length<=MAX&&b.toString('base64')===v);return b;
}
function digest(bytes){return createHash('sha256').update(bytes).digest();}
// Developer Portal has been observed moving this exact *excluded* UBLExtensions
// namespace declaration from the signature subtree onto the Invoice root.
// For this synthetic-only test, prove literal canonical equality AFTER removing
// exactly that additional root attribute. No arbitrary namespace or business
// content normalization is permitted, and this is NOT a production signature
// or official SDK validation.
const EXT_ROOT=Buffer.from(' xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"');
function onlyPortalExtensionNamespaceAdded(sent,cleared){
 if(sent.includes(EXT_ROOT))return false;
 const start=cleared.indexOf(EXT_ROOT),rootEnd=cleared.indexOf(Buffer.from('>'));
 if(start<0||rootEnd<0||start>=rootEnd||cleared.indexOf(EXT_ROOT,start+EXT_ROOT.length)!==-1)return false;
 return Buffer.concat([cleared.subarray(0,start),cleared.subarray(start+EXT_ROOT.length)]).equals(sent);
}
const code=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,120}$/.test(v)?v:null;
export function verifyDeveloperSandboxClearance({httpStatus,body,request,canonicalize}){
 need([200,202].includes(httpStatus)&&body?.clearanceStatus==='CLEARED'&&
   ['PASS','WARNING'].includes(body?.validationResults?.status)&&
   Array.isArray(body.validationResults.errorMessages)&&body.validationResults.errorMessages.length===0&&
   Array.isArray(body.validationResults.warningMessages)&&
   body.validationResults.warningMessages.length<=50&&
   typeof canonicalize==='function'&&
   typeof request?.uuid==='string'&&
   SHA.test(request?.invoiceHash??''));
 const expectedHash=Buffer.from(request.invoiceHash,'base64');
 need(expectedHash.length===32);
 const sent=strict64(request.invoice),cleared=strict64(body.clearedInvoice);
 const canonicalSent=canonicalize(sent),canonicalCleared=canonicalize(cleared);
 need(Buffer.isBuffer(canonicalSent)&&Buffer.isBuffer(canonicalCleared)&&
   canonicalSent.length>0&&canonicalCleared.length>0&&
   canonicalSent.length<=MAX&&canonicalCleared.length<=MAX,'CANONICAL_OUTPUT_INVALID');
 // A CLEARED text flag alone is not enough. The returned invoice, after the
 // same ZATCA-style signature/QR exclusions, must canonically match the input.
 const sentHash=digest(canonicalSent),receivedHash=digest(canonicalCleared);
 need(timingSafeEqual(sentHash,expectedHash),'SENT_HASH_MISMATCH');
 const byteExact=timingSafeEqual(receivedHash,expectedHash)&&canonicalSent.equals(canonicalCleared);
 const portalRootExtOnly=!byteExact&&onlyPortalExtensionNamespaceAdded(canonicalSent,canonicalCleared);
 need(byteExact||portalRootExtOnly,'RETURNED_HASH_MISMATCH');
 const codes=body.validationResults.warningMessages.map(x=>code(x?.code??x?.errorCode)).filter(Boolean);
 return Object.freeze({
   status:byteExact?'DEVELOPER_CLEARED_ARTIFACT_MATCHED':'DEVELOPER_CLEARED_ONLY_EXCLUDED_ROOT_NS_DIFFERS',
   canonicalHashIdentical:byteExact,warningCount:body.validationResults.warningMessages.length,
   warningCodes:Object.freeze(codes)
 });
}
