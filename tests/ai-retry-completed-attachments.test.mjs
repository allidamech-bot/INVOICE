import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync('scripts/ai-batch3-premium-conversation.mjs','utf8');
const start=script.indexOf('async function __lourexAnalyzeAttachments('),end=script.indexOf('\\nfunction __lourexInstallPremiumConversation',start);
assert.ok(start>0&&end>start);
function fixture(analyze){
 const ctx={AbortController,DOMException,Map,Set,Array,JSON,analyzeConversationAttachment:analyze};
 vm.runInNewContext(script.slice(start,end)+'\nthis.run=__lourexAnalyzeAttachments;',ctx);
 const h={mounted:true,__intelligenceKernel:{mode:'advisor',scope:{scope:'business',accountId:'a',workspaceId:'w',branchId:'b',threadId:'t'}},state:{conversationAttachments:[{id:'one',file:{name:'one.png'},status:'ready'},{id:'two',file:{name:'two.pdf'},status:'ready'}]},setState(change){Object.assign(this.state,typeof change==='function'?change(this.state):change);}};
 return{h,run:ctx.run};
}
test('failed reply retry reuses complete same-scope sources without re-extraction',async()=>{
 let calls=0;const {h,run}=fixture(async file=>{calls++;return{file,source:{id:file.name,extracted:'exact evidence'}};});
 const first=await run(h,h.state.conversationAttachments),again=await run(h,h.state.conversationAttachments);
 assert.equal(calls,2);assert.equal(again[0].source,first[0].source);assert.equal(again[1].file,first[1].file);
});
test('partial extraction retry processes only the failed file and preserves order',async()=>{
 const calls=[];let fail=true;const {h,run}=fixture(async file=>{calls.push(file.name);if(file.name==='two.pdf'&&fail)throw Error('provider unavailable');return{file,source:{id:file.name}};});
 await assert.rejects(run(h,h.state.conversationAttachments),/provider unavailable/);fail=false;
 const results=await run(h,h.state.conversationAttachments);
 assert.deepEqual(calls,['one.png','two.pdf','two.pdf']);assert.equal(results[0].source.id,'one.png');assert.equal(results[1].source.id,'two.pdf');
});
for(const field of ['accountId','workspaceId','branchId','threadId','mode'])test('cached extraction is not reused after '+field+' changes',async()=>{
 let calls=0;const {h,run}=fixture(async file=>{calls++;return{file,source:{id:file.name}};});await run(h,h.state.conversationAttachments);
 if(field==='mode')h.__intelligenceKernel.mode='controller';else h.__intelligenceKernel.scope[field]='different';
 await run(h,h.state.conversationAttachments);assert.equal(calls,4);
});
test('a replaced File object cannot reuse the old extraction',async()=>{
 let calls=0;const {h,run}=fixture(async file=>{calls++;return{file,source:{id:file.name}};});await run(h,h.state.conversationAttachments);
 h.state.conversationAttachments[0]={...h.state.conversationAttachments[0],file:{name:'one.png'}};
 await run(h,h.state.conversationAttachments);assert.equal(calls,3);
});
test('scope change while extraction is pending cannot install late evidence',async()=>{
 let resolve;const {h,run}=fixture(file=>new Promise(done=>{resolve=()=>done({file,source:{id:'old-scope'}});}));
 const job=run(h,[h.state.conversationAttachments[0]]),rejected=assert.rejects(job,{name:'AbortError'});
 h.__intelligenceKernel.scope.threadId='new-thread';resolve();await rejected;
 assert.equal(h.state.conversationAttachments[0].source,undefined);
});
test('missing account/thread identity never enables reuse',async()=>{
 let calls=0;const {h,run}=fixture(async file=>{calls++;return{file,source:{id:file.name}};});
 delete h.__intelligenceKernel.scope.accountId;
 await run(h,h.state.conversationAttachments);await run(h,h.state.conversationAttachments);assert.equal(calls,4);
});
