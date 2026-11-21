// Only a narrow read-only command is exposed. No mutation or submission endpoint.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const LIMIT=2048;
function send(response,status,body){response.statusCode=status;response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.end(JSON.stringify(body));}
function sameOrigin(request){
  if(request.headers?.['x-requested-with']!=='LOUREX-Invoice')return false;
  try{const origin=new URL(request.headers.origin);return origin.protocol==='https:'&&origin.host===request.headers.host&&!origin.username&&!origin.password&&origin.pathname==='/'&&!origin.search&&!origin.hash;}catch{return false;}
}
async function command(request){
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(String(request.headers?.['content-type']||'')))throw Error('INVALID_COMMAND');
  const chunks=[];let size=0;
  if(request.body!==undefined){const text=typeof request.body==='string'?request.body:JSON.stringify(request.body);if(typeof text!=='string'||Buffer.byteLength(text)>LIMIT)throw Error('REQUEST_TOO_LARGE');chunks.push(Buffer.from(text));}
  else for await(const part of request){const b=Buffer.from(part);size+=b.length;if(size>LIMIT)throw Error('REQUEST_TOO_LARGE');chunks.push(b);}
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length!==3||value.operation!=='status'||typeof value.workspaceId!=='string'||!ID.test(value.workspaceId)||typeof value.documentId!=='string'||!ID.test(value.documentId))throw Error('INVALID_COMMAND');
  return {workspaceId:value.workspaceId,documentId:value.documentId};
}
export function createFiscalStatusHandler({getRuntime}){
  if(typeof getRuntime!=='function')throw Error('FISCAL_STATUS_UNAVAILABLE');
  return async function handler(request,response){
    if(request.method!=='POST'){response.setHeader('Allow','POST');send(response,405,{code:'METHOD_NOT_ALLOWED'});return;}
    if(!sameOrigin(request)){send(response,403,{code:'FISCAL_ORIGIN_FORBIDDEN'});return;}
    const token=String(request.headers?.authorization||'').match(/^Bearer ([A-Za-z0-9._~-]{100,8192})$/)?.[1];
    if(!token){send(response,401,{code:'FISCAL_AUTH_REQUIRED'});return;}
    let runtime;
    try{runtime=await getRuntime(request);}catch{send(response,503,{code:'FISCAL_STATUS_UNAVAILABLE'});return;}
    let identity;
    try{identity=await runtime.verifyIdentity(token);}catch{send(response,401,{code:'FISCAL_AUTH_INVALID'});return;}
    if(identity?.role!=='owner'||typeof identity.uid!=='string'||!ID.test(identity.uid)){send(response,403,{code:'FISCAL_STATUS_FORBIDDEN'});return;}
    let cmd;
    try{cmd=await command(request);}catch(e){send(response,e?.message==='REQUEST_TOO_LARGE'?413:400,{code:e?.message==='REQUEST_TOO_LARGE'?'REQUEST_TOO_LARGE':'INVALID_COMMAND'});return;}
    try{send(response,200,await runtime.status(identity,cmd));}
    catch(e){const denied=e?.message==='FISCAL_STATUS_FORBIDDEN';send(response,denied?403:503,{code:denied?'FISCAL_STATUS_FORBIDDEN':'FISCAL_STATUS_UNAVAILABLE'});}
  };
}
export default createFiscalStatusHandler({getRuntime:async request=>{const {getFiscalQaRuntime}=await import('./status-runtime.js');return getFiscalQaRuntime(request);}});
