import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const api=readFileSync('api/ai-inbox.js','utf8');
function gateway(){
 let calls=0,prompt='';
 const source=api.slice(0,api.indexOf('export default async function handler(')).replace(/^import .+;\s*$/gm,'');
 const policy=vm.runInNewContext(source+'\n({handleToolPlan,rateAllowed,rateBuckets})',{
  routeAiStructured:async options=>{calls++;prompt=options.prompt;return{success:true,data:{version:1,goal:'read',calls:[{id:'r',tool:'inventory.getStatus',argsJson:'{}',reason:'Read'}]}};},
  aiRouterPublicError:()=>({status:503}),Date,Map
 });
 return{...policy,get calls(){return calls;},get prompt(){return prompt;},async run(message){const response={setHeader(){},end(body){this.body=JSON.parse(body);}};await policy.handleToolPlan({message,scope:'business',conversationMode:'controller'},response,'owner');return response;}};
}
test('planner rejects oversized instructions before any model call; never drops trailing corrections',async()=>{
 const g=gateway();const r=await g.run('Prepare quotation '+ 'x'.repeat(6000)+' do not create an invoice');
 assert.equal(r.statusCode,400);assert.equal(g.calls,0);assert.equal(r.body.code,'INVALID_TOOL_REQUEST');
});
test('planner preserves line breaks between authored product rows and their prices',async()=>{
 const g=gateway();const message='Review these lines:\nTea: 12 CTN at 37.20 USD\nCoffee: 8 bags at 7.80 USD';
 await g.run(message);assert.ok(g.prompt.includes(message),'Do not flatten item boundaries before interpretation');
});
test('active-user rate limiter has bounded memory and does not evict live buckets to reset quota',()=>{
 const g=gateway();for(let i=0;i<32;i++)assert.equal(g.rateAllowed({aiVerifiedUid:'first'}),true);
 for(let i=0;i<10000;i++)g.rateAllowed({aiVerifiedUid:'user'+i});
 assert.ok(g.rateBuckets.size<=2048,'Per-process memory must have a fixed cap');
 assert.equal(g.rateAllowed({aiVerifiedUid:'first'}),false,'New identities cannot evict and reset existing quota');
});
test('every canonical composer font rule is at least 16 CSS pixels, including the final owner',()=>{
 const css=readFileSync('src/styles/ai-conversation-workspace.css','utf8');
 const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([,selector])=>selector.trim().endsWith('.lourex-ai-premium-textarea'));
 const fonts=rules.flatMap(([,selector,body])=>[...body.matchAll(/font-size:\s*([0-9.]+)px/g)].map(m=>({selector,size:Number(m[1])})));
 assert.ok(fonts.length);for(const font of fonts)assert.ok(font.size>=16,JSON.stringify(font));
});

test('a signed-in ten-file conversation fits the bounded classify+summarize request budget',()=>{
 const g=gateway();
 for(let i=0;i<10;i++){
  assert.equal(g.rateAllowed({aiVerifiedUid:'legitimate-user'}),true,'classify file '+(i+1));
  assert.equal(g.rateAllowed({aiVerifiedUid:'legitimate-user'}),true,'summarize file '+(i+1));
 }
 assert.equal(g.rateAllowed({aiVerifiedUid:'legitimate-user'}),true,'one action-planning request remains possible');
 for(let i=21;i<32;i++)assert.equal(g.rateAllowed({aiVerifiedUid:'legitimate-user'}),true);
 assert.equal(g.rateAllowed({aiVerifiedUid:'legitimate-user'}),false,'finite 5-minute per-account ceiling remains in force');
 assert.ok(g.rateBuckets.size<=2048);
});

test('gateway quota and upstream provider quota use different error codes and bilingual guidance',()=>{
 assert.match(api,/code:'AI_INBOX_RATE_LIMITED'/);
 assert.match(api,/RATE_MAX=32;/);
 const source=readFileSync('src/lib/ai-request.ts','utf8');
 assert.match(source,/if\(code==='AI_INBOX_RATE_LIMITED'\)/);
 assert.match(source,/لم يتم الاتصال بمزوّد AI/);
 assert.match(source,/if\(code==='AI_RATE_LIMITED'\|\|status===429\)/);
});

test('native document eligibility and free-only failures have specific bilingual error guidance',()=>{
 const client=readFileSync('src/lib/ai-request.ts','utf8');
 for(const code of ['AI_PRIVATE_DOCUMENT_UNAVAILABLE','AI_UNSUPPORTED_MODALITY','AI_FREE_ONLY_REQUIRED'])
   assert.match(client,new RegExp("if\\(code==='"+code+"'\\)"));
 assert.match(client,/لا يوجد حاليًا موديل مجاني معتمد ومؤهل لقراءة ملف PDF الأصلي/);
 assert.match(client,/لم يُرسل الملف إلى مزوّد غير معتمد/);
});
