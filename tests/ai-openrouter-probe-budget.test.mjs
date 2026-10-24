import test from 'node:test';
import assert from 'node:assert/strict';
import {runSyntheticProviderDiagnostic} from '../api/_ai/provider-diagnostics.js';
test('free OpenRouter probes leave a bounded visible-output budget after reasoning, without retries or paid fallback',async()=>{
 const old=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='synthetic-key';
 try{
  for(const [mode,budget] of [['single',1024],['financial',2048]]){
   let calls=0,seen;
   const result=await runSyntheticProviderDiagnostic('openrouter',{mode,fetchImpl:async(url,options)=>{
    calls++;seen={url,body:JSON.parse(options.body)};
    const content=mode==='single'?'1062':'{"D1":214.2,"D2":725,"D3":220.8,"D4":770,"D5":100}';
    return{ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify({model:'synthetic/free-model:free',choices:[{message:{content},finish_reason:'stop'}]})};
   }});
   assert.equal(calls,1);assert.equal(result.status,'PASSED');
   assert.equal(seen.url,'https://openrouter.ai/api/v1/chat/completions');
   assert.equal(seen.body.model,'openrouter/free');assert.equal(seen.body.max_tokens,budget);
   assert.deepEqual(seen.body.reasoning,{effort:'low',exclude:true});
   assert.deepEqual(seen.body.provider,{data_collection:'deny'});
  }
 }finally{if(old===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=old;}
});
