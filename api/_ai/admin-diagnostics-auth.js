import {requireAiFirebaseAuth} from './firebase-auth.js';

// A team member role, a selected operator, or a client-supplied UID never grants this access.
export function diagnosticsOwnerUidAllowed(verifiedUid,configuredUid){
  return typeof verifiedUid==='string'&&typeof configuredUid==='string'&&
    /^[A-Za-z0-9]{20,128}$/.test(configuredUid)&&verifiedUid===configuredUid;
}
export async function requireDiagnosticsOwner(request,response){
  if(!await requireAiFirebaseAuth(request,response))return false;
  if(diagnosticsOwnerUidAllowed(request.aiVerifiedUid,process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID))return true;
  response.statusCode=403;
  response.setHeader('Cache-Control','no-store');
  response.setHeader('Content-Type','application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options','nosniff');
  response.end(JSON.stringify({code:'OWNER_DIAGNOSTICS_FORBIDDEN'}));
  return false;
}
