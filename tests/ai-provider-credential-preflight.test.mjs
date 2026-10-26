import test from 'node:test';
import assert from 'node:assert/strict';
import {checkProviderCredential} from '../api/_ai/provider-diagnostics.js';
test('no removed provider can trigger a metadata request',async()=>{
 for(const provider of ['ollama','gemini','cloudflare','openrouter','kilo']){
 let calls=0;const r=await checkProviderCredential(provider,{fetchImpl:async()=>{calls++;throw Error('No egress');}});
 assert.equal(r.status,'INVALID_PROVIDER');assert.equal(calls,0);
 }
});
