import {requireDiagnosticsOwner} from './_ai/admin-diagnostics-auth.js';

function send(response,status,payload){
  response.statusCode=status;
  response.setHeader('Cache-Control','private, no-store');
  response.setHeader('Content-Type','application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Referrer-Policy','no-referrer');
  response.end(JSON.stringify(payload));
}
function sameOrigin(request){
  if(request.headers?.['x-requested-with']!=='LOUREX-Invoice')return false;
  const origin=String(request.headers?.origin||'');
  if(!origin)return request.headers?.['sec-fetch-site']==='same-origin';
  try{
    const parsed=new URL(origin);
    return parsed.protocol==='https:'&&parsed.host.toLowerCase()===String(request.headers?.host||'').toLowerCase();
  }catch{return false;}
}
export default async function handler(request,response){
  if(request.method!=='POST'){response.setHeader('Allow','POST');send(response,405,{code:'METHOD_NOT_ALLOWED'});return;}
  if(!sameOrigin(request)){send(response,403,{code:'OWNER_DIAGNOSTICS_FORBIDDEN'});return;}
  if(!await requireDiagnosticsOwner(request,response))return;
  send(response,200,{allowed:true});
}
