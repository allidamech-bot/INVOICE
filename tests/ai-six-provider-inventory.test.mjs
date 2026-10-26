import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('public/health.js','utf8');
const start=source.indexOf('async function loadProviderInventory()');
const end=source.indexOf('void loadProviderInventory();',start);
const providers=['groq','ollama'];
async function inventory(rows){
 const slots=providers.map(provider=>({textContent:'',getAttribute:()=>provider}));
 const user={uid:'synthetic-owner',getIdToken:async()=>'synthetic-token'};
 const ctx={safeProviders:new Set(providers),window:{firebase:{auth:()=>({currentUser:user})}},document:{querySelectorAll:()=>slots},fetch:async()=>({ok:true,json:async()=>({providers:rows})}),AbortSignal,Map,Set};
 vm.runInNewContext(source.slice(start,end)+'\nthis.run=loadProviderInventory;',ctx);await ctx.run();return slots;
}
const row=provider=>({provider,configured:true,syntheticProbeAllowed:true,routerEnvironmentEligible:true});
test('owner inventory renders only retained providers after permanent removal',async()=>{
 const slots=await inventory(providers.map(row));
 for(const s of slots)assert.match(s.textContent,/Key configured/);
});
for(const [name,ids] of [['stale seventh provider',[...providers,'mistral']],['missing provider',providers.slice(1)],['duplicate provider',[...providers.slice(0,1),'groq']],['unknown provider',[...providers.slice(0,1),'unapproved']]])test('inventory rejects '+name,async()=>{
 const slots=await inventory(ids.map(row));for(const s of slots)assert.doesNotMatch(s.textContent,/Key configured/);
});
