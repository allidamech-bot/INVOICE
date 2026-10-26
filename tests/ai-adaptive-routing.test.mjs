import test from 'node:test';
import assert from 'node:assert/strict';
const originalFetch=globalThis.fetch,originalNow=Date.now,originalEnv={...process.env};
let clock=1000000,serial=0,ask;
const schema={type:'OBJECT',properties:{value:{type:'STRING'}},required:['value']};
function reply(status,data){return{ok:status===200,status,headers:{get:()=>null},text:async()=>JSON.stringify(data)}}
function valid(){return reply(200,{choices:[{message:{content:'{"value":"ok"}'}}]})}
test.beforeEach(async()=>{
 process.env.GROQ_API_KEY='synthetic-groq';process.env.CLOUDFLARE_AI_API_TOKEN='synthetic-cf';process.env.CLOUDFLARE_ACCOUNT_ID='synthetic-account';
 Date.now=()=>clock;
 const {routeAiStructured}=await import('../api/_ai/router.js?adaptive='+ ++serial);
 ask=(extra={})=>routeAiStructured({taskType:'business_copilot',prompt:'synthetic',schema,...extra});
});
test.afterEach(()=>{globalThis.fetch=originalFetch;Date.now=originalNow;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv)});
test('three actual validated alternate successes change priority, one sample does not; stale observations expire',async()=>{
 const calls=[];
 globalThis.fetch=async url=>{const groq=String(url).includes('groq.com');calls.push(groq?'groq':'cloudflare');clock+=groq?1000:100;return groq?reply(400,{error:{code:'json_validate_failed'}}):valid()};
 for(let i=0;i<3;i++)assert.equal((await ask()).provider,'cloudflare');
 assert.deepEqual(calls,['groq','cloudflare','groq','cloudflare','groq','cloudflare']);
 calls.length=0;
 assert.equal((await ask()).provider,'cloudflare');assert.deepEqual(calls,['cloudflare']);
 clock+=300001;calls.length=0;await ask();assert.equal(calls[0],'groq');
});
test('fast invalid replies do not earn priority over validated replies',async()=>{
 const calls=[];
 globalThis.fetch=async url=>{const groq=String(url).includes('groq.com');calls.push(groq?'groq':'cloudflare');clock+=groq?1:500;return groq?reply(200,{choices:[{message:{content:'{"unexpected":true}'}}]}):valid()};
 for(let i=0;i<3;i++)assert.equal((await ask()).provider,'cloudflare');
 calls.length=0;assert.equal((await ask()).provider,'cloudflare');assert.deepEqual(calls,['cloudflare']);
});
test('unconfigured private route returns timed zero-attempt metadata without egress',async()=>{
 delete process.env.GROQ_API_KEY;delete process.env.CLOUDFLARE_AI_API_TOKEN;
 globalThis.fetch=()=>{throw new Error('must not dispatch')};
 const result=await ask();assert.equal(result.success,false);assert.equal(result.errorCode,'AI_NOT_CONFIGURED');assert.equal(result.attemptCount,0);assert.equal(result.totalLatencyMs,0);assert.equal(result.eligibleModelCount,0);
});
test('quarantined first model does not reserve time needed by an available alternate',async()=>{
 let groq=0;globalThis.fetch=async url=>{if(String(url).includes('groq.com')){groq++;return reply(401,{})}return valid()};
 await ask();const next=await ask();assert.equal(next.provider,'cloudflare');assert.equal(groq,1);assert.equal(next.attemptCount,1);assert.equal(next.availableModelCount,1);
});
