import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function fixture(fetch){
 let fire,cleared=0;
 const context={exports:{},t:en=>en,currentCloudIdToken:async()=> 'synthetic-token',fetch,AbortController,DOMException,
  window:{setTimeout(callback){fire=callback;return 1;},clearTimeout(){cleared++;}}};
 vm.runInNewContext(ts.transpile(readFileSync('src/lib/ai-request.ts','utf8').replace(/^import .*;$/gm,''),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),context);
 return{request:context.exports.requestAiJson,expire:()=>fire(),cleared:()=>cleared};
}
const resultWithinTick=promise=>Promise.race([promise.then(value=>({value}),error=>({error})),new Promise(resolve=>setTimeout(()=>resolve({hung:true}),20))]);
test('deadline settles even when response JSON ignores transport abort; late data cannot succeed',async()=>{
 let finishBody,transportSignal;
 const h=fixture(async(_url,options)=>{transportSignal=options.signal;return{ok:true,json:()=>new Promise(resolve=>{finishBody=resolve;})};});
 const run=h.request('/api/ai-core',{message:'synthetic'},undefined,100);
 await new Promise(setImmediate);h.expire();
 const result=await resultWithinTick(run);assert.equal(result.hung,undefined,'Loading must end even if response-body reading never settles');
 assert.match(result.error.message,/timed out/i);assert.equal(transportSignal.aborted,true);assert.equal(h.cleared(),1);
 finishBody({answer:'late response'});await new Promise(setImmediate);
 assert.match((await resultWithinTick(run)).error.message,/timed out/i);
});
test('user cancellation settles even when fetch ignores abort and clears the deadline',async()=>{
 const h=fixture(()=>new Promise(()=>{})),controller=new AbortController();
 const run=h.request('/api/ai-core',{},controller.signal,100);await new Promise(setImmediate);controller.abort();
 const result=await resultWithinTick(run);assert.equal(result.hung,undefined);assert.equal(result.error.name,'AbortError');assert.equal(h.cleared(),1);
});
test('a fast response makes one request and clears the timer without aborting it',async()=>{
 let calls=0,signal;const h=fixture(async(_url,options)=>{calls++;signal=options.signal;return{ok:true,json:async()=>({answer:'synthetic answer'})};});
 const reply=await h.request('/api/ai-core',{});assert.equal(reply.answer,'synthetic answer');assert.equal(calls,1);assert.equal(signal.aborted,false);assert.equal(h.cleared(),1);
});
