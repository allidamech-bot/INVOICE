import {requireAiFirebaseAuth} from '../_ai/firebase-auth.js';
import {getProductionPeriodService} from './admin.js';
import {validatePeriodCommand,PeriodError,fail} from './period-format.js';

function send(response,status,body){response.statusCode=status;response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.end(JSON.stringify(body));}
function sameOrigin(request){
  if(request.headers['x-requested-with']!=='LOUREX-Invoice')return false;
  try{
    const origin=new URL(request.headers.origin);
    return origin.protocol==='https:'&&!origin.username&&!origin.password&&origin.pathname==='/'&&!origin.search&&!origin.hash
      &&origin.host===request.headers.host;
  }catch{return false;}
}
export function createWorkspaceCommitHandler({getService=getProductionPeriodService}={}){
  return async function workspaceCommit(request,response){
    if(request.method!=='POST'){send(response,405,{code:'METHOD_NOT_ALLOWED'});return;}
    if(!sameOrigin(request)){send(response,403,{code:'PERIOD_ORIGIN_FORBIDDEN'});return;}
    if(!await requireAiFirebaseAuth(request,response))return;
    if(request.aiVerifiedRole!=='owner'){send(response,403,{code:'PERIOD_OWNER_REQUIRED'});return;}
    try{
      let bytes=0,parts=[];
      if(request.body!==undefined){
        const text=typeof request.body==='string'?request.body:JSON.stringify(request.body);
        if(Buffer.byteLength(text)>16_000)fail(413,'REQUEST_TOO_LARGE');parts=[text];
      }else for await(const part of request){bytes+=Buffer.byteLength(part);if(bytes>16_000)fail(413,'REQUEST_TOO_LARGE');parts.push(Buffer.from(part));}
      let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts.map(p=>Buffer.from(p)))));}catch{fail(400,'INVALID_COMMAND');}
      const command=validatePeriodCommand(parsed),service=getService();
      const result=await service.execute({uid:request.aiVerifiedUid,role:request.aiVerifiedRole},command);
      send(response,200,result);
    }catch(error){
      // Do not log source records, keys, bearer tokens or raw upstream errors.
      if(error instanceof PeriodError)send(response,error.status,{code:error.code});
      else send(response,503,{code:'PERIOD_SERVICE_UNAVAILABLE'});
    }
  };
}
export default createWorkspaceCommitHandler();
