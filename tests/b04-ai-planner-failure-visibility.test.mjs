import test from 'node:test';
import assert from 'node:assert/strict';
import {aiPlanningUnavailableResult,orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {emptyVault} from '../dist/src/lib/defaults.js';

// Explicitly opt into Controller. Missing mode must remain Advisor (fail-closed).
const context={screen:'items',conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}};
async function withPlannerReply(reply,run){
  const existingFetch=globalThis.fetch,existingWindow=globalThis.window,existingFirebase=globalThis.firebase;
  globalThis.firebase={apps:[{}],auth:()=>({currentUser:{uid:'fixture-user',getIdToken:async()=> 'signed-test-token'}})};
  let calls=0;
  globalThis.firebase={apps:[{}],auth:()=>({currentUser:{uid:'test-user',getIdToken:async()=> 'signed-fixture-token'}})};
  globalThis.window={setTimeout,clearTimeout};
  globalThis.fetch=async(_url,options)=>{
    calls+=1;
    return typeof reply==='function'?await reply(options):reply;
  };
  try{return await run(()=>calls);}
  finally{globalThis.fetch=existingFetch;globalThis.window=existingWindow;globalThis.firebase=existingFirebase;}
}
const request=(message,options={})=>orchestrateAiToolRequest({
  message,context,vault:emptyVault(),language:options.language??'en',signal:options.signal
});
const ok=(payload,status=200)=>({ok:status>=200&&status<300,status,json:async()=>payload});

test('B04: invalid planner JSON returns to conversation without staging an action',async()=>{
  await withPlannerReply(ok({plan:{version:1,goal:'update products',calls:[{id:'a',tool:'not-a-tool',args:{},reason:''}]}}),async calls=>{
    const result=await request('Update products from the report');
    assert.equal(result,null,'the caller will ask the dialogue engine for clarification');
    assert.equal(calls(),1);
  });
});
test('B04: an empty plan cannot masquerade as a completed command',async()=>{
  await withPlannerReply(ok({plan:{version:1,goal:'save',calls:[]}}),async calls=>{
    const result=await request('احفظ جميع الأصناف',{language:'ar'});
    assert.equal(result,null);
    assert.equal(calls(),1);
  });
});
test('B04: rate limits delegate to natural dialogue without staging business changes',async()=>{
  await withPlannerReply(ok({code:'AI_RATE_LIMITED',message:'AI Inbox is temporarily rate limited.'},429),async calls=>{
    const result=await request('Save a new customer');
    assert.equal(result,null);
    assert.equal(calls(),1);
  });
});
test('B04: HTTP 429 public wording cannot authorize an action',async()=>{
  await withPlannerReply(ok({code:'AI_RATE_LIMITED',message:'AI providers are temporarily at capacity. Retry shortly.'},429),async calls=>{
    const result=await request('Create a new invoice draft',{language:'ar'});
    assert.equal(result,null);
    assert.equal(calls(),1);
  });
});
test('B04: failed network planner defers to the nonexecuting dialogue gateway',async()=>{
  await withPlannerReply(async()=>{throw new TypeError('Network failure');},async calls=>{
    assert.equal(await request('Create a new invoice draft'),null);
    assert.equal(calls(),1);
  });
});
test('B04: missing providers cannot cause mutation or a fabricated tool result',async()=>{
  for(const language of ['en','ar'])await withPlannerReply(ok({code:'AI_NOT_CONFIGURED',message:'Unavailable'},503),async calls=>{
    const result=await request('Create a new invoice draft',{language});
    assert.equal(result,null);
    assert.equal(calls(),1);
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


test('B04 document target routing follows the new document, not a referenced source',async()=>{
  const {promoteDocumentCreationPlan}=await import('../dist/src/lib/ai-tool-client.js');
  const invoicePlan={version:1,goal:'invoice',calls:[{id:'invoice',tool:'invoice.prepare',args:{kind:'invoice',items:[]},reason:'review'}]};
  const quotePlan={version:1,goal:'quotation',calls:[{id:'quote',tool:'quotation.prepare',args:{kind:'proforma',items:[]},reason:'review'}]};
  for(const command of [
    'Create invoice from quotation Q-2026-4',
    'Please prepare a sales invoice based on the existing quote',
    'أنشئ فاتورة من عرض السعر السابق',
    'جهز لي فاتورة من عرض سعر العميل'
  ]){
    const promoted=promoteDocumentCreationPlan(invoicePlan,command);
    assert.equal(promoted.calls[0].tool,'document.createDraft',command);
    assert.equal(promoted.calls[0].args.kind,'invoice');
  }
  for(const command of [
    'Create quotation from invoice INV-2026-4',
    'Make a customer quote based on the purchase invoice',
    'أنشئ عرض سعر من فاتورة المورد'
  ]){
    const promoted=promoteDocumentCreationPlan(quotePlan,command);
    assert.equal(promoted.calls[0].tool,'document.createDraft',command);
    assert.equal(promoted.calls[0].args.kind,'proforma');
  }
  for(const command of [
    'Do not create an invoice',
    "Don't create a quotation",
    'لا انشئ فاتورة',
    'لا تجهز عرض سعر',
    'Create a report summarizing invoices',
    'Prepare a preview of invoice',
    'جهز لي معاينة فاتورة',
  ]){
    const plan=promoteDocumentCreationPlan(invoicePlan,command);
    assert.equal(plan.calls[0].tool,'invoice.prepare',
      'a negated or non-document request must not be promoted: '+command);
  }
});

test('B04 negations and wrong document kinds never yield an executable proposal',async()=>{
  const create=(kind)=>ok({plan:{version:1,goal:'create draft',calls:[{id:'doc-1',tool:'document.createDraft',args:{kind,items:[{descriptionEn:'Test item',quantity:'1',unitPrice:'10'}]},reason:'model'}]}});
  for(const [message,kind] of [
    ['Do not create an invoice','invoice'],
    ["Don't create a quotation",'proforma'],
    ['لا تنشئ فاتورة','invoice'],
    ['لا تجهز عرض سعر','proforma'],
    ['Create a quotation from an invoice','invoice']
  ]){
    await withPlannerReply(create(kind),async calls=>{
      const result=await request(message);
      // Negated instructions need no model action plan at all. A wrong-kind
      // planned action is rejected by the local business guard.
      assert.equal(result?.proposal??null,null,message);
      assert.equal(result?.plan.calls.length??0,0,message);
      if(result)assert.match(result.answer,/No data was changed/,message);
      assert.ok(calls()<=1,message);
    });
  }
});

test('B04 saved-quotation invoice commands never ask an AI model to invent source data',async()=>{
 const maliciousPlanner=ok({plan:{version:1,goal:'fake invoice',calls:[{
   id:'invoice-1',tool:'document.createDraft',
   args:{kind:'invoice',items:[{descriptionEn:'Hallucinated line',quantity:'99',unitPrice:'0.01'}]},
   reason:'invented from incomplete source'
 }]}});
 for(const message of [
   'Create an invoice from a quotation',
   'أنشئ فاتورة من عرض السعر',
   'Create invoice from quotation Q-2026-04',
   'أنشئ فاتورة من عرض السعر السابق'
 ]){
   await withPlannerReply(maliciousPlanner,async calls=>{
     const result=await request(message);
     assert.equal(calls(),0,'unspecified saved source must not use AI planning: '+message);
     assert.equal(result?.proposal,null,message);
     assert.equal(result?.plan.calls.length,0,message);
     assert.match(result?.answer,/Provide exactly one complete saved quotation number/,message);
   });
 }
});
