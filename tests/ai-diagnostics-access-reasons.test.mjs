import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/health.js',import.meta.url),'utf8');
async function deniedPage({firebase=true,user=true,status=403,throws=false,allowed=false,tokenFailure=false,tokenStalled=false}={}){
 const gate={textContent:''},main={hidden:true};let calls=0,removals=0,tokenReads=0;
 const sandbox={window:{},document:{getElementById:id=>id==='ownerGate'?{get textContent(){return gate.textContent;},set textContent(v){gate.textContent=v;},remove(){removals++;}}:null,querySelector:()=>main},setTimeout:(fn,ms)=>tokenStalled&&ms===7000?(queueMicrotask(fn),0):setTimeout(fn,ms),clearTimeout,AbortSignal,fetch:async(_url,init)=>{calls++;assert.equal(init.headers['X-Lourex-Admin-Diagnostics'],'access-check');if(throws)throw Error('private upstream detail');return{ok:status===200,status,json:async()=>({allowed})};}};
 if(firebase)sandbox.window.firebase={apps:[{}],auth:()=>({onAuthStateChanged:callback=>{queueMicrotask(()=>callback(user?{getIdToken:async()=>{tokenReads++;if(tokenFailure)throw Error('private upstream detail');if(tokenStalled)return new Promise(()=>{});return 'synthetic-token-do-not-display';}}:null));return()=>{};}})};
 vm.runInNewContext(source,sandbox);
 await new Promise(resolve=>setImmediate(resolve));
 return{message:gate.textContent,calls,main,removals,tokenReads};
}
for(const [name,input,reason,calls] of [
 ['missing SDK',{firebase:false},'SDK_UNAVAILABLE',0],
 ['no restored session',{user:false},'SIGN_IN_REQUIRED',0],
 ['expired/invalid server session',{status:401},'SESSION_REJECTED',1],
 ['server owner denial',{status:403},'OWNER_DIAGNOSTICS_FORBIDDEN',1],
 ['upstream failure',{status:503},'ACCESS_SERVICE_UNAVAILABLE',1],
 ['network failure',{throws:true},'ACCESS_NETWORK_ERROR',1],
 ['token refresh failure',{tokenFailure:true},'TOKEN_REFRESH_FAILED',0],
 ['stalled token refresh',{tokenStalled:true},'TOKEN_REFRESH_TIMEOUT',0],
 ['invalid success payload',{status:200,allowed:false},'ACCESS_NOT_CONFIRMED',1],
])test('AI diagnostics distinguish '+name+' and keep protected content hidden',async()=>{
 const result=await deniedPage(input);
 assert.ok(result.message.includes(reason),`expected ${reason}, got ${result.message}`);
 assert.equal(result.calls,calls);assert.equal(result.main.hidden,true);assert.equal(result.removals,0);
 for(const secret of ['synthetic-token-do-not-display','private upstream detail'])assert.equal(result.message.includes(secret),false);
});
