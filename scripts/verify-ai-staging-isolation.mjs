/**
 * Read-only staging preflight; no Firebase, provider, or customer connections.
 * A Vercel Preview hostname alone does not isolate a Firebase identity/data plane.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const PRODUCTION_FIREBASE_PROJECT_ID='lourex-invoice';
const stringValue=(source,field)=>{
  const pattern=new RegExp("\\b"+field+"\\s*[:=]\\s*['\"]([^'\"]+)['\"]");
  return pattern.exec(source)?.[1]||'';
};
export function inspectAiStagingBoundary({clientSource,serverSource,vercelSource,
  expectedProjectId,vercelEnvironment,branchName}){
  const errors=[],expected=String(expectedProjectId||'').trim();
  if(vercelEnvironment!=='preview')errors.push('QA_ENV_NOT_PREVIEW');
  if(branchName!=='fix/ai-audit-root-causes-20261017')errors.push('QA_WRONG_BRANCH');
  if(!expected||expected===PRODUCTION_FIREBASE_PROJECT_ID)errors.push('QA_DEDICATED_PROJECT_REQUIRED');
  const client=stringValue(clientSource,'projectId');
  const authDomain=stringValue(clientSource,'authDomain');
  const backend=stringValue(serverSource,'FIREBASE_PROJECT_ID');
  let rewrites=[];
  try{rewrites=JSON.parse(vercelSource).rewrites||[];}
  catch{errors.push('QA_INVALID_VERCEL_CONFIG');}
  const auth=rewrites.find(x=>x.source==='/__/auth/:path*');
  const destination=String(auth?.destination||'');
  if(!client||client===PRODUCTION_FIREBASE_PROJECT_ID||client!==expected)errors.push('QA_CLIENT_FIREBASE_NOT_ISOLATED');
  if(!backend||backend===PRODUCTION_FIREBASE_PROJECT_ID||backend!==expected)errors.push('QA_BACKEND_FIREBASE_NOT_ISOLATED');
  if(!authDomain||authDomain!==expected+'.firebaseapp.com')errors.push('QA_AUTH_DOMAIN_NOT_ISOLATED');
  if(destination!=='https://'+expected+'.firebaseapp.com/__/auth/:path*')errors.push('QA_AUTH_REWRITE_NOT_ISOLATED');
  return {ready:errors.length===0,codes:errors,checked:4};
}
const current=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(current){
  const files={
    clientSource:readFileSync('src/cloud/firebase-config.ts','utf8'),
    serverSource:readFileSync('api/_ai/firebase-auth.js','utf8'),
    vercelSource:readFileSync('vercel.json','utf8')
  };
  const result=inspectAiStagingBoundary({
    ...files,
    expectedProjectId:process.env.LOUREX_AI_QA_FIREBASE_PROJECT_ID,
    vercelEnvironment:process.env.VERCEL_ENV,
    branchName:process.env.VERCEL_GIT_COMMIT_REF||process.env.GITHUB_HEAD_REF||process.env.GITHUB_REF_NAME
  });
  if(!result.ready){
    console.error('AI_STAGING_BLOCKED: authenticated Preview testing is unsafe or unverifiable. '+result.codes.join(', '));
    process.exitCode=2;
  }else{
    console.log('AI_STAGING_BOUNDARY_PASS: isolated client/auth-server/same-origin rewrite match the separate QA Firebase project.');
  }
}
