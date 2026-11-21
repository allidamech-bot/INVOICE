import {openSync,readFileSync,fstatSync,closeSync,constants} from 'node:fs';
import {validateStagingServiceScopes} from './staging-service-supervisor.js';

const VERSION='LOUREX_AWS_ENROLLMENT_COMMAND_V1';
const CREDENTIALS='/run/credentials/lourex-aws-enrollment.service';
const ACTIONS=new Set(['provision','begin','check','operational','activate']);
const deny=()=>{throw Error('LOUREX_AWS_ENROLLMENT_NOT_READY');};
const exact=(obj,fields)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
 Object.keys(obj).sort().join(',')===fields.slice().sort().join(',');
const scopeId=s=>JSON.stringify([s.environment,s.accountUid,s.workspaceId,s.egsId]);

// Root-installed operator instruction, never supplied in a browser request.
// It contains no OTP, PIN, key, CSID, invoice or external URL.
export function validateAwsEnrollmentInstruction(instruction,allowedScopes){
 try{
  if(!exact(instruction,['version','action','scope',...(instruction?.action==='check'||instruction?.action==='operational'?['expectedVersion']:[])])||
   instruction.version!==VERSION||!ACTIONS.has(instruction.action))deny();
  const allowed=validateStagingServiceScopes(allowedScopes);
  const [scope]=validateStagingServiceScopes([instruction.scope]);
  if(!allowed.some(x=>scopeId(x)===scopeId(scope)))deny();
  if(['check','operational'].includes(instruction.action)&&
   (!Number.isSafeInteger(instruction.expectedVersion)||instruction.expectedVersion<1))deny();
  return Object.freeze({
   action:instruction.action,scope,
   ...(['check','operational'].includes(instruction.action)?{expectedVersion:instruction.expectedVersion}:{}),
  });
 }catch{deny();}
}
export function requireAwsEnrollmentOperator(env){
 if(env?.LOUREX_AWS_STAGING_ENABLED!=='true'||
  env?.LOUREX_AWS_ENROLLMENT_APPROVED!=='true'||
  env?.LOUREX_AWS_DISPATCH_APPROVED||env?.LOUREX_AWS_WORKER_ENABLED||
  env?.VERCEL_ENV||env?.FIRESTORE_EMULATOR_HOST||env?.FIREBASE_AUTH_EMULATOR_HOST||
  env?.AWS_ACCESS_KEY_ID||env?.AWS_SECRET_ACCESS_KEY||env?.AWS_SESSION_TOKEN||
  env?.AWS_PROFILE||env?.LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON||
  env?.CREDENTIALS_DIRECTORY!==CREDENTIALS)deny();
 return true;
}
// Only a systemd-managed private credential may carry the six-digit OTP.
// The operator service is oneshot with Restart=no; it never prints the OTP.
export function readAwsEnrollmentOtp(){
 const path=CREDENTIALS+'/otp';
 let fd;
 try{
  fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const st=fstatSync(fd);
  if(!st.isFile()||st.nlink!==1||st.size!==6||
   (st.mode&0o077)!==0||(st.uid!==0&&st.uid!==process.getuid()))deny();
  const bytes=readFileSync(fd);
  try{
   if(bytes.length!==6||!bytes.every(b=>b>=48&&b<=57))deny();
   return bytes.toString('ascii');
  }finally{bytes.fill(0);}
 }catch{deny();}finally{if(fd!==undefined)closeSync(fd);}
}
// Only the original CSR/CSID/compliance and EGS activation implementation
// can perform any operation; this controller never constructs or signs an XML.
export async function executeAwsEnrollmentInstruction(runtime,instruction,{otp}={}){
 const {scope,action,expectedVersion}=instruction??{};
 if(!runtime||!ACTIONS.has(action)||!scope||scope.environment!=='simulation')deny();
 if(action==='begin'?typeof otp!=='string'||!/^[0-9]{6}$/.test(otp):otp!==undefined)deny();
 const identity=Object.freeze({uid:scope.accountUid,role:'owner'});
 const cmd={workspaceId:scope.workspaceId,egsId:scope.egsId};
 let out;
 switch(action){
  case 'provision':
   if(typeof runtime.provision!=='function')deny();
   await runtime.provision(scope);
   return Object.freeze({action,state:'key-bound'});
  case 'begin':
   if(typeof runtime.enrollment?.begin!=='function')deny();
   out=await runtime.enrollment.begin(identity,{...cmd,otp});
   break;
  case 'check':
   if(typeof runtime.enrollment?.check!=='function'||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)deny();
   out=await runtime.enrollment.check(identity,{...cmd,expectedVersion});
   break;
  case 'operational':
   if(typeof runtime.enrollment?.operational!=='function'||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)deny();
   out=await runtime.enrollment.operational(identity,{...cmd,expectedVersion});
   break;
  case 'activate':
   if(typeof runtime.activate!=='function')deny();
   out=await runtime.activate(scope);
   break;
  default:deny();
 }
 if(!out||typeof out.state!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(out.state))deny();
 // Never print OTP, CSID, credential response, certificate or identity data.
 return Object.freeze({action,state:out.state});
}
