import {parseFiscalCommand} from './command-service.js';
const LIMIT=2048;
function send(r,status,body){r.statusCode=status;r.setHeader('Content-Type','application/json; charset=utf-8');r.setHeader('Cache-Control','no-store');r.setHeader('X-Content-Type-Options','nosniff');r.end(JSON.stringify(body));}
function origin(req){try{const u=new URL(req.headers.origin);return req.headers['x-requested-with']==='LOUREX-Invoice'&&u.protocol==='https:'&&u.host===req.headers.host&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash;}catch{return false;}}
async function read(req){
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(String(req.headers?.['content-type']||'')))throw Error('INVALID_COMMAND');
  let bytes;if(req.body!==undefined){const s=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(typeof s!=='string'||Buffer.byteLength(s)>LIMIT)throw Error('REQUEST_TOO_LARGE');bytes=Buffer.from(s);}else{const chunks=[];let n=0;for await(const p of req){const b=Buffer.from(p);n+=b.length;if(n>LIMIT)throw Error('REQUEST_TOO_LARGE');chunks.push(b);}bytes=Buffer.concat(chunks);}
  return parseFiscalCommand(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
}
const conflicts=new Set(['FISCAL_REVIEW_REQUIRED','FISCAL_REVIEW_CHANGED','FISCAL_STALE_ISSUE','STALE_ONBOARDING','ONBOARDING_ATTEMPT_HELD','FISCAL_APPROVAL_ALREADY_BOUND','FISCAL_SOURCE_CHANGED','FISCAL_PERIOD_CLOSED','FISCAL_RECOVERY_NOT_ELIGIBLE','FISCAL_RECONCILIATION_NOT_ELIGIBLE']);
export function createFiscalCommandHandler({getRuntime}){
  return async(req,res)=>{
    if(req.method!=='POST'){res.setHeader('Allow','POST');send(res,405,{code:'METHOD_NOT_ALLOWED'});return;}
    if(!origin(req)){send(res,403,{code:'FISCAL_ORIGIN_FORBIDDEN'});return;}
    const token=String(req.headers?.authorization||'').match(/^Bearer ([A-Za-z0-9._~-]{100,8192})$/)?.[1];
    if(!token){send(res,401,{code:'FISCAL_AUTH_REQUIRED'});return;}
    let runtime;try{runtime=await getRuntime(req);}catch{send(res,503,{code:'FISCAL_COMMAND_UNAVAILABLE'});return;}
    let identity;try{identity=await runtime.verifyIdentity(token);}catch{send(res,401,{code:'FISCAL_AUTH_INVALID'});return;}
    if(identity?.role!=='owner'){send(res,403,{code:'FISCAL_COMMAND_FORBIDDEN'});return;}
    let cmd;try{cmd=await read(req);}catch(e){send(res,e.message==='REQUEST_TOO_LARGE'?413:400,{code:e.message==='REQUEST_TOO_LARGE'?'REQUEST_TOO_LARGE':'INVALID_COMMAND'});return;}
    try{send(res,200,await runtime.execute(identity,cmd));}catch(e){const code=e.message;if(conflicts.has(code))send(res,409,{code});else if(code==='FISCAL_COMMAND_FORBIDDEN'||code==='FISCAL_APPROVAL_FORBIDDEN')send(res,403,{code:'FISCAL_COMMAND_FORBIDDEN'});else send(res,503,{code:'FISCAL_COMMAND_UNAVAILABLE'});}
  };
}
export default createFiscalCommandHandler({getRuntime:async request=>{const {getFiscalQaCommandRuntime}=await import('./command-runtime.js');return getFiscalQaCommandRuntime({},request);}});
