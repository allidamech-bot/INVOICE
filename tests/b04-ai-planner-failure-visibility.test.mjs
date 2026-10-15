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
test('B04: HTTP 429 remains a rate-limit notice even when public copy says at capacity',async()=>{
  await withPlannerReply(ok({code:'AI_RATE_LIMITED',message:'AI providers are temporarily at capacity. Retry shortly.'},429),async()=>{
    const result=await request('Create a new invoice draft',{language:'ar'});
    assert.ok(result);
    assert.match(result.answer,/الحد المؤقت/);
    assert.match(result.answer,/لم أغيّر أي بيانات/);
    assert.equal(result.results.length,0);
    assert.equal(result.proposal,null);
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

test('missing deployment providers report configuration failure without preparing any action',async()=>{
  for(const language of ['en','ar'])await withPlannerReply(ok({code:'AI_NOT_CONFIGURED',message:'Unavailable'},503),async calls=>{
    const result=await request('Create a new invoice draft',{language});
    assert.equal(calls(),1);assert.equal(result.proposal,null);assert.equal(result.results.length,0);assert.equal(result.plan.calls.length,0);
    assert.match(result.answer,language==='ar'?/غير مهيّئين/:/not configured/);
    assert.match(result.answer,language==='ar'?/لم يتم تجهيز الإجراء/:/No action was prepared/);
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

test('B04 model plans cannot reverse a negated document creation command or choose the wrong document',async()=>{
  const create=(kind)=>ok({plan:{version:1,goal:'create draft',calls:[{id:'doc-1',tool:'document.createDraft',args:{kind,items:[{descriptionEn:'Test item',quantity:'1',unitPrice:'10'}]},reason:'model'}]}});
  for(const [message,kind] of [
    ['Do not create an invoice','invoice'],
    ["Don't create a quotation",'proforma'],
    ['لا تنشئ فاتورة','invoice'],
    ['لا تجهز عرض سعر','proforma'],
    ['Create an invoice from a quotation','proforma'],
    ['أنشئ فاتورة من عرض السعر','proforma'],
    ['Create a quotation from an invoice','invoice']
  ]){
    await withPlannerReply(create(kind),async calls=>{
      const result=await request(message);
      assert.equal(calls(),1,message);
      assert.ok(result,message);
      assert.equal(result.proposal,null,message);
      assert.equal(result.plan.calls.length,0,message);
      assert.match(result.answer,/No data was changed/,message);
    });
  }
});


test('B04 quotation-sourced invoice reaches the normal document planner',async()=>{
 const planner=ok({plan:{version:1,goal:'create customer invoice',calls:[{
   id:'invoice-1',tool:'invoice.prepare',args:{kind:'invoice',currency:'USD',items:[
     {descriptionEn:'Verified line from quotation',quantity:'2',unit:'CTN',unitPrice:'10.00'}
   ]},reason:'explicit user instruction'
 }]}});
 for(const message of ['Create invoice from quotation Q-2026-04','أنشئ فاتورة من عرض السعر السابق']){
   await withPlannerReply(planner,async calls=>{
     const result=await request(message);
     assert.equal(calls(),1,'invoice request should reach the planner: '+message);
     assert.equal(result?.plan.calls[0]?.tool,'document.createDraft',message);
     assert.equal(result?.proposal?.capability,'document.createDraft',message);
     assert.equal(result?.proposal?.kind,'invoice',message);
     assert.equal(result?.proposal?.items?.length,1,message);
     assert.equal(result?.proposal?.items?.[0]?.unitPrice,'10.00',message);
   });
 }
});
