import {createHash} from 'node:crypto';
import {assertReadyForProductionCsid,assertProductionOnboardingReady} from './onboarding.js';

// Internal transport only. Production requires a separate trusted authorization callback.
// Never log request/response bodies: onboarding responses contain secrets.
const ORIGIN='https://gw-fatoora.zatca.gov.sa/e-invoicing/';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH=/^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;
const MAX_RESPONSE=2*1024*1024;
const MAX_INVOICE=512*1024;
function base64(value,max){
  if(typeof value!=='string'||!value.length||value.length>Math.ceil(max/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('INVALID_BASE64');
  const bytes=Buffer.from(value,'base64');
  if(!bytes.length||bytes.length>max||bytes.toString('base64')!==value)throw Error('INVALID_BASE64');
  return bytes;
}
function scope(s){
  if(!s||!ID.test(s.accountUid)||!ID.test(s.workspaceId)||!ID.test(s.egsId)
    ||typeof s.accountUid!=='string'||typeof s.workspaceId!=='string'||typeof s.egsId!=='string')throw Error('INVALID_SCOPE');
  return Object.freeze({accountUid:s.accountUid,workspaceId:s.workspaceId,egsId:s.egsId});
}
function auth(credential,expected,environment,kind){
  if(!credential||credential.environment!==environment||credential.kind!==kind
    ||credential.accountUid!==expected.accountUid||credential.workspaceId!==expected.workspaceId||credential.egsId!==expected.egsId)
    throw Error('CREDENTIAL_SCOPE_MISMATCH');
  base64(credential.binarySecurityToken,32*1024);
  if(typeof credential.secret!=='string'||credential.secret.length<1||credential.secret.length>4096||!/^[!-~]+$/.test(credential.secret))throw Error('INVALID_CREDENTIAL');
  return 'Basic '+Buffer.from(credential.binarySecurityToken+':'+credential.secret).toString('base64');
}
function invoice(p){
  if(!p||typeof p.uuid!=='string'||!UUID.test(p.uuid)||typeof p.invoiceHash!=='string'||!HASH.test(p.invoiceHash))throw Error('INVALID_INVOICE_IDENTITY');
  base64(p.invoice,MAX_INVOICE);
  return {uuid:p.uuid,invoiceHash:p.invoiceHash,invoice:p.invoice};
}
function issued(body,s,environment,kind){
  if(!body||body.dispositionMessage!=='ISSUED'||(body.errors!=null&&(!Array.isArray(body.errors)||body.errors.length)))throw Error('CERTIFICATE_NOT_CONFIRMED');
  if(!Number.isSafeInteger(body.requestID)||body.requestID<=0)throw Error('INVALID_REQUEST_ID');
  const record={...s,environment,kind,requestId:body.requestID,binarySecurityToken:body.binarySecurityToken,secret:body.secret};
  auth(record,s,environment,kind);
  // Return to the trusted caller only, which must protect and verify the certificate.
  return record;
}
async function readJson(response,retainMalformed=false){
  if(!response?.body?.getReader)throw Error('INVALID_RESPONSE');
  const reader=response.body.getReader();let count=0;const chunks=[];
  try{
    while(true){
      const part=await reader.read();
      if(part.done)break;
      count+=part.value.byteLength;
      if(count>MAX_RESPONSE){await reader.cancel();throw Error('RESPONSE_TOO_LARGE');}
      chunks.push(Buffer.from(part.value));
    }
    const bytes=Buffer.concat(chunks);
    if(!bytes.length)throw Error('INVALID_RESPONSE');
    try{
      const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_RESPONSE');
      return {value,bytes};
    }catch(error){if(!retainMalformed)throw error;return {value:null,bytes};}
  }finally{reader.releaseLock();}
}
function validation(body){
  const v=body?.validationResults;
  if(!v||!Array.isArray(v.errorMessages)||!Array.isArray(v.warningMessages))return null;
  if(v.errorMessages.length||!['PASS','WARNING'].includes(v.status))return null;
  return {warnings:v.status==='WARNING'||v.warningMessages.length>0};
}
function evidence(r){return {httpStatus:r.status,evidenceDigest:createHash('sha256').update(r.bytes).digest('hex'),evidenceBytes:r.bytes};}
function outcome(r,mode,compliance=false){
  const info=evidence(r), v=validation(r.value);
  const accepted=mode==='clearance'?r.value?.clearanceStatus==='CLEARED':r.value?.reportingStatus==='REPORTED';
  if(r.status===200||r.status===202){
    if(accepted&&v){
      if(mode==='clearance'&&!compliance){
        try{const clearedBytes=base64(r.value.clearedInvoice,MAX_INVOICE);
          return {...info,status:'clearance-response',warnings:v.warnings,clearedBytes};
        }catch{return {...info,status:'uncertain'};}
      }
      return {...info,status:compliance?'compliance-response':'reporting-response',warnings:v.warnings};
    }
  }
  // Never follow redirects, reroute 303, or retry a potentially accepted request.
  return {...info,status:'uncertain'};
}
// Reconstruct a submission result from an immutable raw receipt. No HTTP call.
export function classifyStoredSubmissionResponse({httpStatus,bytes,mode}){
  if(!['clearance','reporting'].includes(mode)||!Number.isInteger(httpStatus)||httpStatus<100||httpStatus>599||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_RESPONSE)throw Error('INVALID_STORED_RESPONSE');
  let value=null;try{const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))value=parsed;}catch{}
  return outcome({status:httpStatus,value,bytes:Buffer.from(bytes)},mode);
}
function createClient({environment,authorizedScope,fetchImpl=fetch,timeoutMs=15000,authorizeOperation},endpoint){
  if(typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw Error('INVALID_TRANSPORT');
  const s=scope(authorizedScope);
  const checkedAuth=(c,k)=>auth(c,s,environment,k);
  async function post(path,body,headers={},retainMalformed=false,claim={}){
    if(environment==='production'){
      if(await authorizeOperation(Object.freeze({scope:Object.freeze({...s,environment}),...claim}))!==true)throw Error('PRODUCTION_OPERATION_NOT_AUTHORIZED');
    }
    const controller=new AbortController();let timer;
    try{return await Promise.race([(async()=>{
      const res=await fetchImpl(ORIGIN+endpoint+'/'+path,{method:'POST',redirect:'error',signal:controller.signal,
        headers:{'Content-Type':'application/json','Accept':'application/json','Accept-Language':'en','Accept-Version':'V2',...headers},
        body:JSON.stringify(body)});
      if(!Number.isInteger(res.status)||res.status<100||res.status>599)throw Error('INVALID_RESPONSE');
      const {value,bytes}=await readJson(res,retainMalformed);
      return {status:res.status,value,bytes};
    })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('ZATCA_TIMEOUT'));},timeoutMs);})]);}catch{throw Error('ZATCA_TRANSPORT_UNCERTAIN');}
    finally{clearTimeout(timer);}
  }
  return Object.freeze({
    async requestCompliance({otp,csr}){
      if(typeof otp!=='string'||!/^[0-9]{6}$/.test(otp))throw Error('INVALID_OTP');
      base64(csr,32*1024);
      const r=await post('compliance',{csr},{OTP:otp},false,{operation:'compliance-csid',csrDigest:createHash('sha256').update(Buffer.from(csr,'base64')).digest('hex')});
      if(r.status!==200&&r.status!==201)throw Error('COMPLIANCE_CSID_NOT_CONFIRMED');
      return issued(r.value,s,environment,'compliance');
    },
    async checkCompliance(credential,payload,mode){
      if(mode!=='clearance'&&mode!=='reporting')throw Error('INVALID_MODE');
      const document=invoice(payload);
      const r=await post('compliance/invoices',document,{Authorization:checkedAuth(credential,'compliance')},false,{operation:'compliance-check',mode,uuid:document.uuid,invoiceHash:document.invoiceHash,artifactDigest:createHash('sha256').update(Buffer.from(document.invoice,'base64')).digest('hex'),credentialRequestId:credential.requestId});
      return outcome(r,mode,true);
    },
    async requestProductionCsid(credential,onboarding){
      const authorization=checkedAuth(credential,'compliance');
      if(environment==='simulation')assertReadyForProductionCsid(onboarding,credential);else assertProductionOnboardingReady(onboarding,credential);
      if(!Number.isSafeInteger(credential.requestId)||credential.requestId<=0)throw Error('INVALID_REQUEST_ID');
      const r=await post('production/csids',{compliance_request_id:String(credential.requestId)},{Authorization:authorization},false,{operation:'operational-csid',credentialRequestId:credential.requestId,onboardingVersion:onboarding.version});
      if(r.status!==200&&r.status!==201)throw Error('PRODUCTION_CSID_NOT_CONFIRMED');
      return issued(r.value,s,environment,'production');
    },
    async submit(credential,payload,mode){
      if(mode!=='clearance'&&mode!=='reporting')throw Error('INVALID_MODE');
      const document=invoice(payload);
      const r=await post('invoices/'+mode+'/single',document,{Authorization:checkedAuth(credential,'production'),...(mode==='clearance'?{'Clearance-Status':'1'}:{})},true,{operation:'submit',mode,uuid:document.uuid,invoiceHash:document.invoiceHash,artifactDigest:createHash('sha256').update(Buffer.from(document.invoice,'base64')).digest('hex'),credentialRequestId:credential.requestId});
      return classifyStoredSubmissionResponse({httpStatus:r.status,bytes:r.bytes,mode});
    }
  });
}

export function createZatcaSimulationClient(options){
  if(options?.environment!=='simulation')throw Error('PRODUCTION_DISABLED');
  // A production-scoped EGS can never be silently re-labelled as a QA unit.
  // The data-plane authority must still validate account/workspace/EGS.
  if(options?.authorizedScope?.environment!==undefined&&options.authorizedScope.environment!=='simulation')throw Error('SIMULATION_SCOPE_REQUIRED');
  return createClient(options,'simulation');
}
// Private composition only. The authorizer must atomically claim the exact
// operation against verified, persisted tenant state (not a browser flag).
export function createZatcaProductionClient(options){
  if(options?.environment!=='production'||options.authorizedScope?.environment!=='production'||typeof options.authorizeOperation!=='function')throw Error('PRODUCTION_TRANSPORT_NOT_CONFIGURED');
  return createClient(options,'core');
}
