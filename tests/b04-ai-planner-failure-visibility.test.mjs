import test from 'node:test';
import assert from 'node:assert/strict';
import {aiPlanningUnavailableResult,orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {emptyVault} from '../dist/src/lib/defaults.js';

const context={screen:'items',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}};
async function withPlannerReply(reply,run){
  const existingFetch=globalThis.fetch,existingWindow=globalThis.window;
  let calls=0;
  globalThis.window={setTimeout,clearTimeout};
  globalThis.fetch=async(_url,options)=>{
    calls+=1;
    return typeof reply==='function'?await reply(options):reply;
  };
  try{return await run(()=>calls);}
  finally{globalThis.fetch=existingFetch;globalThis.window=existingWindow;}
}
const request=(message,options={})=>orchestrateAiToolRequest({
  message,context,vault:emptyVault(),language:options.language??'en',signal:options.signal
});
const ok=(payload,status=200)=>({ok:status>=200&&status<300,status,json:async()=>payload});

test('B04: invalid planner output for an explicit action reports failure instead of using chat fallback',async()=>{
  await withPlannerReply(ok({plan:{version:1,goal:'update products',calls:[{id:'a',tool:'not-a-tool',args:{},reason:''}]}}),async calls=>{
    const result=await request('Update products from the report');
    assert.ok(result);
    assert.equal(calls(),1);
    assert.equal(result.proposal,null);
    assert.equal(result.results.length,0);
    assert.equal(result.plan.calls.length,0);
    assert.match(result.answer,/valid, safe action plan/);
    assert.match(result.answer,/No data was changed/);
  });
});

test('B04: empty tool plan does not pretend that a requested operation succeeded',async()=>{
  await withPlannerReply(ok({plan:{version:1,goal:'save',calls:[]}}),async()=>{
    const result=await request('احفظ جميع الأصناف',{language:'ar'});
    assert.ok(result);
    assert.match(result.answer,/لم أغيّر أي بيانات/);
    assert.equal(result.proposal,null);
  });
});

test('B04: rate limit is explained without claiming an action completed',async()=>{
  await withPlannerReply(ok({code:'AI_RATE_LIMITED',message:'AI Inbox is temporarily rate limited.'},429),async()=>{
    const result=await request('Save a new customer');
    assert.ok(result);
    assert.match(result.answer,/temporarily rate limited/);
    assert.match(result.answer,/No data was changed/);
    assert.equal(result.results.length,0);
  });
});

test('B04: network failure for an action gives a clear retry instruction',async()=>{
  await withPlannerReply(async()=>{throw new TypeError('Network failure');},async()=>{
    const result=await request('Create a new invoice draft');
    assert.ok(result);
    assert.match(result.answer,/action planner is unavailable/);
    assert.equal(result.proposal,null);
  });
});

test('B04: non-action read/chat fallback retains existing natural-language behavior',async()=>{
  await withPlannerReply(ok({plan:{version:1,goal:'lookup',calls:[]}}),async()=>{
    const result=await request('Compare customer options for a new loyalty campaign');
    assert.equal(result,null);
  });
});

test('B04: cancelled planning never shows a false action error',async()=>{
  const controller=new AbortController();
  controller.abort();
  await withPlannerReply(async()=>{throw Error('Should never fetch');},async calls=>{
    await assert.rejects(request('Save product changes',{signal:controller.signal}),/AbortError|Cancelled/);
    assert.equal(calls(),0);
  });
});

test('B04: safe notices are bilingual and contain zero executable calls',()=>{
  for(const reason of ['unavailable','invalid','limited']){
    const notice=aiPlanningUnavailableResult('سجل المعلومات','ar',reason);
    assert.equal(notice.proposal,null);
    assert.equal(notice.plan.calls.length,0);
    assert.equal(notice.plannedBy,'local');
    assert.match(notice.answer,/لم/);
  }
});
