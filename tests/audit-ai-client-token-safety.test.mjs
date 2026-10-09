import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Firebase token refresh rejects a request after switching account identity',async()=>{
  const {currentCloudIdToken}=await import('../dist/src/cloud/firebase.js');
  const previous=globalThis.firebase;
  let resolveToken=()=>{};
  const oldUser={uid:'account-old',getIdToken:()=>new Promise(resolve=>{resolveToken=resolve;})};
  const session={currentUser:oldUser};
  globalThis.firebase={apps:[{}],auth:()=>session};
  try{
    const pending=currentCloudIdToken();
    session.currentUser={uid:'account-new',getIdToken:async()=> 'new-token'};
    resolveToken('old-token');
    await assert.rejects(pending,/account changed/i);
    assert.equal(await currentCloudIdToken(),'new-token');
    session.currentUser={uid:'',getIdToken:async()=> 'must-not-send'};
    await assert.rejects(currentCloudIdToken(),/session ended/i);
  }finally{globalThis.firebase=previous;}
});

test('AI JSON request does not send a cancelled request after a slow token refresh',async()=>{
  const {requestAiJson}=await import('../dist/src/lib/ai-request.js');
  const previousFirebase=globalThis.firebase,previousWindow=globalThis.window,previousFetch=globalThis.fetch;
  let resolveToken=()=>{},fetchCount=0;
  const user={uid:'account-test',getIdToken:()=>new Promise(resolve=>{resolveToken=resolve;})};
  globalThis.firebase={apps:[{}],auth:()=>({currentUser:user})};
  globalThis.window={setTimeout,clearTimeout};
  globalThis.fetch=async()=>{fetchCount+=1;throw new Error('A cancelled request must not reach fetch.');};
  try{
    const controller=new AbortController();
    const pending=requestAiJson('/api/ai-core',{message:'review'},controller.signal);
    controller.abort();
    resolveToken('fixture-token');
    await assert.rejects(pending,error=>error?.name==='AbortError');
    assert.equal(fetchCount,0);
  }finally{
    globalThis.firebase=previousFirebase;
    globalThis.window=previousWindow;
    globalThis.fetch=previousFetch;
  }
});

test('pending Firebase token refresh aborts without waiting for the provider to answer',async()=>{
  const {currentCloudIdToken}=await import('../dist/src/cloud/firebase.js');
  const previous=globalThis.firebase;
  const user={uid:'account-long-refresh',getIdToken:()=>new Promise(()=>{})};
  globalThis.firebase={apps:[{}],auth:()=>({currentUser:user})};
  try{
    const controller=new AbortController();
    const pending=currentCloudIdToken(controller.signal);
    controller.abort();
    await assert.rejects(pending,error=>error?.name==='AbortError');
  }finally{globalThis.firebase=previous;}
});

test('all three AI client request paths check cancellation immediately after token refresh',async()=>{
  for(const path of ['src/lib/ai-request.ts','src/lib/product-import-ai.ts','src/lib/logo-rebuild.ts']){
    const source=await readFile(new URL('../'+path,import.meta.url),'utf8');
    assert.match(source,/const token=await currentCloudIdToken\((?:controller\.signal|signal)\);\s*if\((?:controller\.signal|signal\?)\.aborted\)/,path);
  }
});
