import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {diagnosticsOwnerUidAllowed} from '../api/_ai/admin-diagnostics-auth.js';

async function isolated(path,mocks){
 const key='__qa'+crypto.randomUUID().replaceAll('-','');globalThis[key]=mocks;
 const source=readFileSync(path,'utf8').replace(/import \{([^}]+)\} from '[^']+';/g,(_all,names)=>`const {${names}}=globalThis.${key};`);
 return{module:await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')),clear:()=>delete globalThis[key]};
}
test('planner response includes only metadata for an explicitly server-authorized owner',async()=>{
 const f=await isolated('api/_ai/draft-plan.js',{
  routeAiStructured:async options=>{options.onDiagnostic?.({provider:'groq',model:'openai/gpt-oss-120b',category:'timeout',latencyMs:12000,attempt:1,secret:'PRIVATE'});return{success:false,errorCode:'AI_TIMEOUT',requestId:'qa',totalLatencyMs:12000};},
  aiRouterPublicError:()=>({status:504,code:'AI_TIMEOUT'})});
 try{const body={conversationMode:'controller',scope:'business',ownerDiagnostics:true,message:'PRIVATE',draft:{id:'qa',revision:1,rows:[{id:'a'}]}};
  assert.equal((await f.module.planWorkingDraft(body)).body.diagnostic,undefined,'A body flag cannot authorize diagnostics');
  const result=await f.module.planWorkingDraft(body,{ownerDiagnostics:true});
  assert.equal(result.body.diagnostic.attempts[0].category,'timeout');
  assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE|secret/);
 }finally{f.clear();}
});
test('actual Inbox gateway uses verified UID rather than client owner claims',async()=>{
 const original=process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID;process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID='a'.repeat(28);
 try{for(const owner of [false,true]){
  let captured;const f=await isolated('api/ai-inbox.js',{
   diagnosticsOwnerUidAllowed,requireAiFirebaseAuth:async request=>{request.aiVerifiedUid=(owner?'a':'b').repeat(28);return true;},
   planWorkingDraft:async(_body,options)=>{captured=options;return{status:200,body:{ok:true}};}});
  try{const body={mode:'working-draft-plan',ownerDiagnostics:true};
   const request={method:'POST',headers:{host:'qa.example',origin:'https://qa.example','x-requested-with':'LOUREX-Invoice'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body));}};
   const response={setHeader(){},end(){}};await f.module.default(request,response);
   assert.equal(captured.ownerDiagnostics,owner);
  }finally{f.clear();}
 }}finally{if(original===undefined)delete process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID;else process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID=original;}
});
test('client diagnostic display accepts fixed categories only, never arbitrary error contents',()=>{
 const source=readFileSync('src/lib/ai-request.ts','utf8').replace(/^import .*;$/gm,'');
 const ctx={exports:{},t:(en,ar)=>ar};vm.runInNewContext(ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),ctx);
 const summary=ctx.exports.aiOwnerDiagnosticSummary({stage:'draft-plan',attempts:[{provider:'groq',category:'timeout',latencyMs:12000,secret:'PRIVATE'},{provider:'cloudflare',category:'PRIVATE',latencyMs:1}]});
 assert.match(summary,/groq: timeout 12000ms/);assert.doesNotMatch(summary,/PRIVATE|cloudflare/);
});
