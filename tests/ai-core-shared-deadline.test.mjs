import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {buildAiFinanceContext} from '../dist/src/lib/ai-finance.js';
import {buildAiBusinessContext} from '../dist/src/lib/ai-business.js';
import {buildProductPricingContext} from '../dist/src/lib/product-pricing-intelligence.js';
import * as dialogueHelpers from '../api/_ai/lourex-dialogue.js';
import {aiRouterPublicError} from '../api/_ai/router.js';

async function isolated(path,mocks){
 const key='__deadline'+crypto.randomUUID().replaceAll('-','');globalThis[key]=mocks;
 const url=pathToFileURL(process.cwd()+'/'+path);
 const source=readFileSync(path,'utf8').replace(/import \{([^}]+)\} from '([^']+)';/g,(_all,names,spec)=>
  spec in mocks?`const {${names}}=globalThis.${key}[${JSON.stringify(spec)}];`:`import {${names}} from '${new URL(spec,url).href}';`);
 return{module:await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')),clear:()=>delete globalThis[key]};
}
for(const message of ['سويلي عرض سعر ب٥٠ كرتون منه','سويلي عرض سعر ب50 كرتون منه','Prepare a quotation for 50 cartons of that item'])test('structured planning and dialogue share one deadline: '+message,async()=>{
 const originalNow=Date.now;let clock=1_000_000,calls=[];Date.now=()=>clock;
 const routeAiStructured=async options=>{calls.push(options);const first=calls.length===1;
  clock+=Math.min(first?30_000:40_000,options.totalBudgetMs??50_000);
  return first?{success:false,errorCode:'AI_INVALID_RESULT'}:{success:true,data:{answer:'What selling price, currency and customer should the quotation use?'}};};
 const d=await isolated('api/_ai/lourex-dialogue.js',{'./router.js':{routeAiStructured}});
 const c=await isolated('api/ai-core.js',{'./_ai/firebase-auth.js':{requireAiFirebaseAuth:async()=>true},'./_ai/router.js':{routeAiStructured,aiRouterPublicError},'./_ai/lourex-dialogue.js':{...dialogueHelpers,naturalLourexDialogue:d.module.naturalLourexDialogue}});
 try{
  const vault=emptyVault(),business=buildAiBusinessContext(vault,'2026-10-26');
  const context={version:5,screen:'home',language:'ar',conversationMode:'controller',business,
   finance:buildAiFinanceContext({documents:[],payments:[],customers:[]},message,business.asOf),
   pricing:buildProductPricingContext(vault,message,business.asOf),drafting:{defaults:{currency:'USD',language:'en'},items:[],customers:[]}};
  const body={message,context};const request={method:'POST',headers:{host:'invoice-three-puce.vercel.app',origin:'https://invoice-three-puce.vercel.app','x-requested-with':'LOUREX-Invoice'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body));}};
  const response={setHeader(){},end(raw){this.body=JSON.parse(raw);}};
  await c.module.default(request,response);
  assert.equal(response.statusCode,200,JSON.stringify(response.body));assert.equal(calls.length,2);
  assert.ok(clock-1_000_000<=40_000,'The two internal model routes must not run for 70s behind a 60s caller');
  assert.ok(calls[0].totalBudgetMs<=26_000);assert.ok(calls[1].totalBudgetMs<=14_000,'Fallback receives only remaining time');
  assert.equal(response.body.proposal,null);
 }finally{Date.now=originalNow;c.clear();d.clear();}
});

test('dialogue diagnostics gateway ignores client owner claims and uses verified UID',async()=>{
 const {diagnosticsOwnerUidAllowed}=await import('../api/_ai/admin-diagnostics-auth.js');
 const configured=process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID;
 process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID='a'.repeat(28);
 try{for(const owner of [false,true]){
  const routeAiStructured=async options=>{
   options.onDiagnostic?.({provider:'groq',category:'rate_limit',latencyMs:20,fallbackIndex:0,secret:'PRIVATE'});
   options.onDiagnostic?.({provider:'cloudflare',category:'timeout',latencyMs:12000,fallbackIndex:1});
   return{success:false,errorCode:'AI_TIMEOUT',requestId:'trace-gateway',totalLatencyMs:12020};
  };
  const d=await isolated('api/_ai/lourex-dialogue.js',{'./router.js':{routeAiStructured}});
  const c=await isolated('api/ai-core.js',{
   './_ai/firebase-auth.js':{requireAiFirebaseAuth:async req=>{req.aiVerifiedUid=(owner?'a':'b').repeat(28);return true;}},
   './_ai/admin-diagnostics-auth.js':{diagnosticsOwnerUidAllowed},
   './_ai/lourex-dialogue.js':{...dialogueHelpers,naturalLourexDialogue:d.module.naturalLourexDialogue}
  });
  try{
   const vault=emptyVault(),business=buildAiBusinessContext(vault,'2026-10-29');
   const body={message:'Explain a fictional notebook business',ownerDiagnostics:true,context:{version:5,screen:'home',language:'en',conversationMode:'controller',business,
    finance:buildAiFinanceContext({documents:[],payments:[],customers:[]},'',business.asOf),
    pricing:buildProductPricingContext(vault,'',business.asOf),drafting:{defaults:{currency:'USD',language:'en'},items:[],customers:[]}}};
   const req={method:'POST',headers:{host:'qa.example',origin:'https://qa.example','x-requested-with':'LOUREX-Invoice'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body));}};
   const res={setHeader(){},end(raw){this.body=JSON.parse(raw);}};
   await c.module.default(req,res);
   assert.equal(res.statusCode,503);assert.equal(res.body.requestId,'trace-gateway');
   assert.equal(Boolean(res.body.diagnostic),owner);
   if(owner){assert.equal(res.body.diagnostic.attempts.length,2);assert.equal(res.body.diagnostic.totalLatencyMs,12020);}
   assert.doesNotMatch(JSON.stringify(res.body),/PRIVATE|secret/);
  }finally{c.clear();d.clear();}
 }}finally{if(configured===undefined)delete process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID;else process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID=configured;}
});
