import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Firebase UID is cryptographically verified before every public AI provider route',()=>{
 const files=readDirectory(new URL('../api/',import.meta.url)).filter(x=>x.endsWith('.js'));
 for(const file of files){
   const body=source('api/'+file);
   if(!body.includes('routeAiStructured('))continue;
   assert.match(body,/requireAiFirebaseAuth\(request,response\)/,file+' must reject unsigned users');
   assert.match(body,/sameOriginRequest\(request\)/,file+' must retain origin checks');
   const handler=body.slice(body.indexOf('export default async function handler('));
   assert.match(handler,/if\(!await requireAiFirebaseAuth\(request,response\)\)return;/,file+' must authenticate before routing provider input');
   const firstAuth=handler.indexOf('requireAiFirebaseAuth(request,response)');
   const firstDispatch=handler.indexOf('handleToolPlan(body,response)');
   if(firstDispatch>=0)assert.ok(firstAuth<firstDispatch,file+' must authenticate before tool-plan dispatch');
 }
});
import {readdirSync as readDirectory} from 'node:fs';
test('No provider model may plan protected financial side effects',()=>{
 const api=source('api/ai-inbox.js');
 const before=api.split('const TOOL_GUIDE=')[0];
 for(const name of ['document.finalize','payment.record','inventory.adjust','financial.delete','accounting.post']){
  assert.equal(before.includes("'"+name+"'"),false,name+' must not be present in server-side allowed tool IDs');
 }
 assert.match(api,/HIGH IMPACT tools are NOT available via the provider planner/);
});
test('The opt-in provider smoke does not run with missing QA credentials or contact external services',()=>{
 const entry=new URL('../scripts/qa-ai-provider-sandbox.mjs',import.meta.url);
 const env={...process.env,LOUREX_AI_QA_CONFIRM:'isolated-qa-no-customer-data',
   LOUREX_AI_QA_GROQ_API_KEY:'',GROQ_API_KEY:'prohibited-production-placeholder',
   GEMINI_API_KEY:'prohibited-production-placeholder'};
 const result=spawnSync(process.execPath,[entry.pathname],{encoding:'utf8',env,timeout:7000});
 assert.equal(result.status,2);
 assert.match(result.stderr,/SANDBOX_NOT_CONFIGURED/);
 assert.doesNotMatch(result.stdout+result.stderr,/prohibited-production-placeholder/);
});
test('Real-provider workflow never sends business sources or inherits production secret names',()=>{
 const workflow=source('.github/workflows/lourex-ai-batches1-7-free-qa.yml');
 const testProgram=source('scripts/qa-ai-provider-sandbox.mjs');
 assert.match(workflow,/if: github\.event_name == 'workflow_dispatch' && inputs\.provider_sandbox == true/);
 assert.match(workflow,/secrets\.LOUREX_AI_QA_GROQ_API_KEY/);
 assert.doesNotMatch(workflow,/secrets\.(?:GROQ_API_KEY|GEMINI_API_KEY|CLOUDFLARE_AI_API_TOKEN)/);
 assert.match(testProgram,/delete process\.env\[name\]/);
 assert.match(testProgram,/LOUREX_SANDBOX_OK/);
 assert.doesNotMatch(testProgram,/(?:https?:\/\/invoice-three|fetch\(\s*['"]https?:\/\/)/);
});
