import {parseProductionProfileCommand} from './production-profile.js';
import {parseProductionEnrollmentCommand} from './production-enrollment-command.js';
import {parseProductionIssuanceCommand} from './production-issuance-command.js';
function send(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(body));}
function origin(req){try{const u=new URL(req.headers.origin);return req.headers['x-requested-with']==='LOUREX-Invoice'&&u.protocol==='https:'&&u.host===req.headers.host&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash;}catch{return false;}}
async function read(req){
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(String(req.headers?.['content-type']||'')))throw Error('INVALID_FISCAL_PROFILE');
  let bytes;if(req.body!==undefined){const s=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(typeof s!=='string'||Buffer.byteLength(s)>4096)throw Error('REQUEST_TOO_LARGE');bytes=Buffer.from(s);}else{const parts=[];let n=0;for await(const p of req){const b=Buffer.from(p);n+=b.length;if(n>4096)throw Error('REQUEST_TOO_LARGE');parts.push(b);}bytes=Buffer.concat(parts);}
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(typeof value?.operation==='string'&&value.operation.startsWith('issuance-'))return parseProductionIssuanceCommand(value);
  return typeof value?.operation==='string'&&value.operation.startsWith('enrollment-')?parseProductionEnrollmentCommand(value):parseProductionProfileCommand(value);
}
export function createProductionFiscalProfileHandler({getRuntime}){
  return async(req,res)=>{
    if(req.method!=='POST'){res.setHeader('Allow','POST');send(res,405,{code:'METHOD_NOT_ALLOWED'});return;}
    if(!origin(req)){send(res,403,{code:'FISCAL_PROFILE_FORBIDDEN'});return;}
    const token=String(req.headers?.authorization||'').match(/^Bearer ([A-Za-z0-9._~-]{100,8192})$/)?.[1];
    if(!token){send(res,401,{code:'FISCAL_AUTH_REQUIRED'});return;}
    let runtime;try{runtime=await getRuntime(req);}catch{send(res,503,{code:'FISCAL_PROFILE_UNAVAILABLE'});return;}
    let identity;try{identity=await runtime.verifyIdentity(token);}catch{send(res,401,{code:'FISCAL_AUTH_INVALID'});return;}
    let cmd;try{cmd=await read(req);}catch(e){send(res,e.message==='REQUEST_TOO_LARGE'?413:400,{code:e.message==='REQUEST_TOO_LARGE'?'REQUEST_TOO_LARGE':'INVALID_FISCAL_PROFILE'});return;}
    try{send(res,200,await (cmd.operation.startsWith('issuance-')?runtime.executeIssuance(identity,cmd):cmd.operation.startsWith('enrollment-')?runtime.executeEnrollment(identity,cmd):runtime.execute(identity,cmd)));}catch(e){
      const code=e.message;
      if(code==='FISCAL_PROFILE_FORBIDDEN'||code==='FISCAL_ENROLLMENT_FORBIDDEN'||code==='FISCAL_ISSUANCE_FORBIDDEN')send(res,403,{code});
      else if(['FISCAL_COMPANY_SYNC_REQUIRED','FISCAL_PROFILE_STALE','FISCAL_COMPANY_INCOMPLETE','FISCAL_SELLER_ID_REQUIRED','FISCAL_PROFILE_LOCKED'].includes(code))send(res,409,{code});
      else if(cmd.operation.startsWith('issuance-'))send(res,code==='FISCAL_ISSUANCE_SOURCE_CHANGED'?409:503,{code:code==='FISCAL_ISSUANCE_SOURCE_CHANGED'?code:'FISCAL_ISSUANCE_UNAVAILABLE'});
      else if(cmd.operation.startsWith('enrollment-'))send(res,503,{code:'FISCAL_ENROLLMENT_UNAVAILABLE'});
      else send(res,503,{code:'FISCAL_PROFILE_UNAVAILABLE'});
    }
  };
}
export default createProductionFiscalProfileHandler({getRuntime:async request=>{const {getProductionFiscalProfileRuntime}=await import('./production-profile-runtime.js');return getProductionFiscalProfileRuntime({request});}});
