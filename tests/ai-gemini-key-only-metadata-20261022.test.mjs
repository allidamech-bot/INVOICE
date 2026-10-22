import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkProviderCredential} from '../api/_ai/provider-diagnostics.js';

const KEY='synthetic-test-gemini-key';
async function withGeminiKey(key,run){
  const previous=process.env.GEMINI_API_KEY;
  if(key===null)delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY=key;
  try{return await run();}finally{
    if(previous===undefined)delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY=previous;
  }
}
const response=(status,body,headers={})=>({
  ok:status>=200&&status<300,status,
  headers:{get(name){return headers[name.toLowerCase()]??null;}},
  text:async()=>typeof body==='string'?body:JSON.stringify(body)
});

test('Gemini owner key-only check uses one fixed GET and no inference, request body, or private data',async()=>{
  await withGeminiKey(KEY,async()=>{
    let calls=0;
    const result=await checkProviderCredential('gemini',{fetchImpl:async(url,options)=>{
      calls++;
      assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite');
      assert.equal(options.method,'GET');
      assert.equal(options.body,undefined);
      assert.equal(options.redirect,'error');
      assert.equal(options.headers['x-goog-api-key'],KEY);
      assert.equal(options.headers.Accept,'application/json');
      assert.equal(options.headers.Authorization,undefined);
      return response(200,{name:'models/gemini-2.5-flash-lite',supportedGenerationMethods:['generateContent']});
    }});
    assert.equal(calls,1);
    assert.equal(result.provider,'gemini');
    assert.equal(result.status,'METADATA_ACCESS_OK');
    assert.equal(result.inference,false);
    assert.equal(result.generativeMethodListed,true);
    assert.ok(!JSON.stringify(result).includes(KEY));
  });
});

test('Gemini missing key blocks the upstream request',async()=>{
  await withGeminiKey(null,async()=>{
    const result=await checkProviderCredential('gemini',{fetchImpl:()=>{throw new Error('network must be blocked');}});
    assert.equal(result.status,'NOT_CONFIGURED');
    assert.equal(result.inference,false);
  });
});

test('Gemini metadata never accepts wrong model, malformed JSON or oversized response',async()=>{
  await withGeminiKey(KEY,async()=>{
    for(const [name,fake] of [
      ['wrong model',response(200,{name:'models/different'})],
      ['invalid JSON',response(200,'<SECRET HTML>')],
      ['oversized header',response(200,{name:'models/gemini-2.5-flash-lite'},{'content-length':'12001'})],
      ['oversized body',response(200,'x'.repeat(12001))]
    ]){
      const result=await checkProviderCredential('gemini',{fetchImpl:async()=>fake});
      assert.equal(result.status,'INVALID_RESPONSE',name);
      assert.ok(!JSON.stringify(result).includes('<SECRET'),name);
    }
    const metadata=await checkProviderCredential('gemini',{fetchImpl:async()=>response(200,{name:'models/gemini-2.5-flash-lite',supportedGenerationMethods:[]})});
    assert.equal(metadata.status,'METADATA_ACCESS_OK');
    assert.equal(metadata.generativeMethodListed,false,'no implied generation allowance');
  });
});

test('Gemini errors expose only categories, never provider bodies or credentials',async()=>{
  await withGeminiKey(KEY,async()=>{
    for(const [http,expected] of [[401,'KEY_REJECTED'],[403,'ACCESS_DENIED'],[404,'MODEL_UNAVAILABLE'],[429,'RATE_LIMITED'],[500,'PROVIDER_UNAVAILABLE']]){
      const result=await checkProviderCredential('gemini',{fetchImpl:async()=>response(http,{error:'private key '+KEY})});
      assert.equal(result.status,expected,String(http));
      assert.equal(result.inference,false);
      assert.ok(!JSON.stringify(result).includes(KEY));
    }
  });
});

test('Gemini metadata check reuses existing authenticated same-origin owner-only server path and manual UI',async()=>{
  const read=async p=>readFile(new URL('../'+p,import.meta.url),'utf8');
  const [api,html,ui]=await Promise.all([read('api/ai-core.js'),read('public/health.html'),read('public/health.js')]);
  const auth=api.indexOf('if(!await requireAiFirebaseAuth(request,response))return;');
  const probe=api.indexOf("if(request.headers['x-lourex-admin-diagnostics']==='provider-probe')");
  const owner=api.indexOf('diagnosticsOwnerUidAllowed(request.aiVerifiedUid,process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID)',probe);
  const check=api.indexOf('await checkProviderCredential(provider)',probe);
  assert.ok(auth>0&&probe>auth&&owner>probe&&check>owner,'owner auth precedes Gemini metadata');
  assert.match(api,/if\(!sameOriginRequest\(request\)\)/);
  assert.match(api,/diagnosticRateAllowed\(request\.aiVerifiedUid,provider\)/);
  assert.match(api,/mode==='key-check'&&!\['gemini','mistral','ollama'\]\.includes\(provider\)/);
  assert.match(html,/data-provider-key-check="gemini"/);
  assert.match(ui,/\['gemini','mistral','ollama'\]\.includes\(provider\)/);
  assert.match(ui,/body:JSON\.stringify\(\{provider,mode:'key-check'\}\)/);
  assert.doesNotMatch(ui,/GEMINI_API_KEY/);
});

test('existing Mistral/Ollama metadata checks still avoid inference and keep their auth endpoints',async()=>{
  const nameToEnv={mistral:'MISTRAL_API_KEY',ollama:'OLLAMA_API_KEY'};
  for(const [name,variable] of Object.entries(nameToEnv)){
    const old=process.env[variable];
    process.env[variable]=KEY;
    try{
      let called='';
      const res=await checkProviderCredential(name,{fetchImpl:async(url,options)=>{
        called=url;
        assert.equal(options.method,'GET');
        assert.equal(options.body,undefined);
        assert.equal(options.headers.Authorization,'Bearer '+KEY);
        return response(200,{});
      }});
      assert.equal(res.status,'KEY_AUTHENTICATED');
      assert.equal(res.inference,false);
      assert.equal(called,name==='mistral'?'https://api.mistral.ai/v1/models':'https://ollama.com/api/tags');
    }finally{if(old===undefined)delete process.env[variable];else process.env[variable]=old;}
  }
});
