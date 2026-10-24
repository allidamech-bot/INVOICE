import test from 'node:test';
import assert from 'node:assert/strict';
import {naturalLourexDialogue} from '../api/_ai/lourex-dialogue.js';

test('dialogue preserves known identifier spelling without guessing numbers or merging ambiguous sources',async()=>{
 const oldFetch=globalThis.fetch,keys=['GROQ_API_KEY','CLOUDFLARE_AI_API_TOKEN','GEMINI_API_KEY'];
 const env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const cases=[
  {message:'اعرض QA-X1 بسطرين فقط',answer:'QA‐X1: 10.00 USD\nالسعر مفقود للصنف الآخر.',want:'QA-X1: 10.00 USD\nالسعر مفقود للصنف الآخر.',lines:2},
  {message:'Use exactly two lines for the source items.',memory:'Source rows: QA-X1, QA-X2',answer:'QA‐X1: 10 USD\nQA‑X2: unknown',want:'QA-X1: 10 USD\nQA-X2: unknown',lines:2},
  {message:'Compare the attached items.',sources:[{text:'SKU AB-001'}],answer:'AB−001: unknown; AB‐002: unknown',want:'AB-001: unknown; AB‐002: unknown'},
  {message:'Compare AB-001 and AB‐001 as distinct source labels.',answer:'AB‐001',want:'AB‐001'},
  {message:'Keep the quantities exact: SKU QA-X1.',answer:'QA‐X2: -1.25 USD; 20–30 days; ordinary‐word',want:'QA‐X2: -1.25 USD; 20–30 days; ordinary‐word'},
  {message:'Use a table now.',memory:'Previous user: use exactly two lines. Item QA-X1.',answer:'| SKU |\n| --- |\n| QA‐X1 |',want:'| SKU |\n| --- |\n| QA-X1 |',notLines:true},
 ];
 try{
  process.env.GROQ_API_KEY='synthetic-only';delete process.env.CLOUDFLARE_AI_API_TOKEN;delete process.env.GEMINI_API_KEY;
  for(const row of cases){
   let calls=0,sent;
   globalThis.fetch=async(_url,options)=>{calls++;sent=JSON.parse(options.body);return{ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({answer:row.answer})},finish_reason:'stop'}]})};};
   const result=await naturalLourexDialogue({message:row.message,context:{language:'ar',workingMemory:row.memory,conversationSources:row.sources}},{mode:'advisor'});
   assert.equal(result.success,true);
   assert.equal(result.answer,row.want);
   assert.equal(result.proposal,null);
   assert.equal(calls,1,'formatting must not add retries or inference calls');
   const prompt=JSON.stringify(sent.messages);
   if(row.lines)assert.match(prompt,/exactly 2 logical lines/);
   if(row.notLines)assert.doesNotMatch(prompt,/exactly 2 logical lines/,'old formatting preferences must not override the current request');
  }
 }finally{globalThis.fetch=oldFetch;for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}}
});
