// Local developer-portal diagnostic only. No real taxpayer, Firestore, HSM,
// production/simulation endpoint, stored credential, automatic retry or deployment.
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {verifyDeveloperSandboxClearance} from '../../api/_fiscal/developer-sandbox-clearance.js';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const BASE='https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/';
const VAT='399999999900003',OTP='123345';
const allowed=new Set(['compliance','production/csids','compliance/invoices','invoices/clearance/single']);
const dir=mkdtempSync(join(tmpdir(),'lourex-dev-sandbox-'));
let stage='csr';
const need=(ok,code)=>{if(!ok)throw Error(code);};
function run(cmd,args,input){
 const result=spawnSync(cmd,args,{cwd:dir,input,timeout:30000,maxBuffer:1024*1024});
 need(!result.error&&result.status===0,'LOCAL_TOOL_FAILED_'+cmd);return result.stdout;
}
function csr(){
 const config=join(dir,'csr.cnf'),key=join(dir,'key.pem'),request=join(dir,'csr.pem');
 writeFileSync(config,'[req]\nprompt=no\ndistinguished_name=dn\nreq_extensions=ext\n[dn]\nC=SA\nOU=Riyadh\nO=LOUREX Synthetic QA\nCN=LOUREX Developer Sandbox\n[ext]\n1.3.6.1.4.1.311.20.2=ASN1:PRINTABLESTRING:TSTZATCA-Code-Signing\nsubjectAltName=dirName:san\n[san]\nSN=1-LOUREX|2-INVOICE|3-'+randomUUID()+'\nUID='+VAT+'\ntitle=1100\nregisteredAddress=Riyadh\nbusinessCategory=Trading\n',{mode:0o600});
 run('openssl',['ecparam','-name','secp256k1','-genkey','-noout','-out',key]);
 run('openssl',['req','-new','-sha256','-key',key,'-config',config,'-out',request]);
 const profile=run('openssl',['req','-in',request,'-verify','-noout','-text']).toString();
 need(profile.includes('secp256k1')&&profile.includes(VAT)&&profile.includes('TSTZATCA-Code-Signing'),'CSR_PROFILE_INVALID');
 const bytes=readFileSync(request);console.log('CSR: PASS (synthetic, local OpenSSL verification)');
 return bytes.toString('base64');
}
function safeCode(v){return typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,120}$/.test(v)?v:null;}
async function post(path,body,headers={}){
 need(allowed.has(path),'SANDBOX_PATH_DENIED');
 const r=await fetch(BASE+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json',Accept:'application/json','Accept-Version':'V2','Accept-Language':'en',...headers},body:JSON.stringify(body)});
 need(r.body?.getReader,'INVALID_RESPONSE');
 const reader=r.body.getReader();let size=0;const chunks=[];
 try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;need(size<=2*1024*1024,'RESPONSE_TOO_LARGE');chunks.push(Buffer.from(x.value));}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{value=null;}
 const v=value?.validationResults;
 const codes=[...(Array.isArray(v?.errorMessages)?v.errorMessages:[]),...(Array.isArray(value?.errors)?value.errors:[])].map(x=>safeCode(x?.code??x?.errorCode)).filter(Boolean).slice(0,20);
 console.log(JSON.stringify({stage,http:r.status,disposition:safeCode(value?.dispositionMessage),validation:safeCode(v?.status),clearance:safeCode(value?.clearanceStatus),errors:codes,warningCount:Array.isArray(v?.warningMessages)?v.warningMessages.length:null}));
 return {status:r.status,value};
}
function auth(credential){
 need(typeof credential?.binarySecurityToken==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(credential.binarySecurityToken)&&credential.binarySecurityToken.length<=50000&&typeof credential?.secret==='string'&&/^[!-~]{1,4096}$/.test(credential.secret),'INVALID_TEST_CSID');
 return {Authorization:'Basic '+Buffer.from(credential.binarySecurityToken+':'+credential.secret).toString('base64')};
}
function issued(r){
 need([200,201].includes(r.status)&&r.value?.dispositionMessage==='ISSUED'&&/^[1-9]\d{0,19}$/.test(String(r.value?.requestID))&&(!r.value.errors||Array.isArray(r.value.errors)&&!r.value.errors.length),'TEST_CSID_NOT_ISSUED');
 auth(r.value);return r.value;
}
function cleared(r){
 return [200,202].includes(r.status)&&r.value?.clearanceStatus==='CLEARED'&&['PASS','WARNING'].includes(r.value?.validationResults?.status)&&Array.isArray(r.value.validationResults.errorMessages)&&!r.value.validationResults.errorMessages.length&&typeof r.value.clearedInvoice==='string'&&r.value.clearedInvoice.length>0;
}
try{
 process.umask(0o077);
 const args=process.argv.slice(2);
 // No key generation or network request without a single explicit mode.
 need(args.length===1&&['--csr-only','--live-developer-sandbox'].includes(args[0]),'EXPLICIT_SANDBOX_MODE_REQUIRED');
 const request=csr();
 if(args[0]==='--csr-only')console.log('OFFLINE CSR ONLY; no request sent.');
 else{
  stage='prepare-standard-invoice';
  const {buildDomesticFiscalCandidate}=await import('../../api/_fiscal/ubl-draft.js');
  const {FIRST_PREVIOUS_INVOICE_HASH}=await import('../../dist/src/lib/fiscal-issuance.js');
  const {hashCanonicalInvoice}=await import('../../api/_fiscal/fiscal-artifacts.js');
  run('javac',['-d',dir,join(ROOT,'scripts/fiscal/CanonicalInvoice.java')]);
  const now=new Date().toISOString(),uuid=randomUUID();
  const seller={country:'SA',vatNumber:VAT,crn:'1000000000',building:'1234',postal:'12345',street:'شارع اختبار',district:'حي اختبار',city:'الرياض',name:'شركة اختبار لوريكس'};
  const input={currency:'SAR',mode:'standard',kind:'invoice',uuid,icv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH,number:'LOUREX-QA-'+uuid,issueDate:now.slice(0,10),issueTime:now.slice(11,19),supplyDate:now.slice(0,10),paymentMeans:'30',seller,buyer:{...seller,name:'مشتري اختبار',vatNumber:'311111111111113'},lines:[{id:'demo-line',name:'منتج تجريبي',quantity:'2',unitNetPrice:'50',unitCode:'PCE',category:'S',rate:'15'}]};
  const candidate=buildDomesticFiscalCandidate(input);
  need(candidate.totals.taxInclusiveTotal==='115.00'&&candidate.totals.vatTotal==='15.00','INVOICE_TOTAL_MISMATCH');
  const payload={uuid,invoiceHash:hashCanonicalInvoice(run('java',['-cp',dir,'CanonicalInvoice','invoice'],candidate.bytes)),invoice:candidate.bytes.toString('base64')};
  console.log('LOUREX standard XML and canonical hash: CREATED (synthetic; not official SDK proof)');
  stage='compliance-csid';
  const compliance=issued(await post('compliance',{csr:request},{OTP}));
  stage='test-operational-csid';
  const operational=issued(await post('production/csids',{compliance_request_id:String(compliance.requestID)},auth(compliance)));
  stage='test-clearance';
  const response=await post('invoices/clearance/single',payload,{...auth(operational),'Clearance-Status':'1'});
  need(cleared(response),'SANDBOX_CLEARANCE_NOT_CONFIRMED');
  const warningCodes=(response.value?.validationResults?.warningMessages??[])
    .map(v=>safeCode(v?.code??v?.errorCode)).filter(Boolean);
  // Only warning identifiers; never print raw validation messages or certificates.
  console.log(JSON.stringify({stage:'clearance-warning-identifiers',warningCodes}));
  const clearedEvidence=verifyDeveloperSandboxClearance({
    httpStatus:response.status,body:response.value,request:payload,
    canonicalize:bytes=>run('java',['-cp',dir,'CanonicalInvoice','invoice'],bytes)
  });
  console.log(JSON.stringify({stage:'verify-cleared-artifact',status:clearedEvidence.status,
    warningCount:clearedEvidence.warningCount,warningCodes:clearedEvidence.warningCodes}));
  console.log('DEVELOPER SANDBOX TRANSPORT POSITIVE — test response only.');
  console.log('No live taxpayer authorization, signed-artifact verification or production acceptance established.');
 }
}catch(e){console.error('SANDBOX STOP:',stage,e?.cause?.code??safeCode(e?.message)??e?.name??'ERROR');process.exitCode=1;}
finally{rmSync(dir,{recursive:true,force:true});}
