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
 const rejection=ctx.exports.aiOwnerDiagnosticSummary({stage:'draft-plan',attempts:[{provider:'groq',category:'unsupported',latencyMs:950,rejection:{status:400,code:'invalid_request_error',param:'response_format',fields:['json_schema','strict','PRIVATE'],message:'PRIVATE'}}]});
 assert.match(rejection,/HTTP400 invalid_request_error response_format json_schema,strict/);assert.doesNotMatch(rejection,/PRIVATE/);
});

test('dialogue failure retains bounded metadata only for authorized diagnostics',async()=>{
 const f=await isolated('api/_ai/lourex-dialogue.js',{
  routeAiStructured:async options=>{options.onDiagnostic?.({provider:'cloudflare',category:'timeout',latencyMs:12000,fallbackIndex:1,secret:'PRIVATE'});return{success:false,errorCode:'AI_TIMEOUT',requestId:'trace-qa',totalLatencyMs:24000};}
 });
 try{
  const cleaned={message:'PRIVATE',context:{}};
  assert.equal((await f.module.naturalLourexDialogue(cleaned)).diagnostic,undefined);
  const result=await f.module.naturalLourexDialogue(cleaned,{ownerDiagnostics:true});
  assert.equal(result.requestId,'trace-qa');
  assert.equal(result.diagnostic.attempts[0].provider,'cloudflare');
  assert.equal(result.diagnostic.attempts[0].fallbackIndex,1);
  assert.equal(result.diagnostic.totalLatencyMs,24000);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|secret/);
 }finally{f.clear();}
});

test('dialogue diagnostic UI renders safe fallback and total duration',()=>{
 const source=readFileSync('src/lib/ai-request.ts','utf8').replace(/^import .*;$/gm,'');
 const ctx={exports:{},t:(en,ar)=>ar};vm.runInNewContext(ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),ctx);
 const summary=ctx.exports.aiOwnerDiagnosticSummary({stage:'dialogue',totalLatencyMs:24000,attempts:[
  {provider:'groq',category:'rate_limit',latencyMs:100,fallbackIndex:0},
  {provider:'cloudflare',category:'timeout',latencyMs:12000,fallbackIndex:1,message:'PRIVATE'},
  {provider:'PRIVATE',category:'timeout',latencyMs:10}]});
 assert.match(summary,/groq: rate_limit 100ms #1/);assert.match(summary,/cloudflare: timeout 12000ms #2/);
 assert.match(summary,/24000ms/);assert.doesNotMatch(summary,/PRIVATE/);
});
