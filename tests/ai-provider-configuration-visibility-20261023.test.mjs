import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {providerConfigurationSnapshot,SYNTHETIC_PROVIDER_IDS} from '../api/_ai/provider-diagnostics.js';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const keys={
 GROQ_API_KEY:'synthetic-secret-groq',CLOUDFLARE_AI_API_TOKEN:'synthetic-secret-cf',
 CLOUDFLARE_ACCOUNT_ID:'synthetic-secret-account',GEMINI_API_KEY:'synthetic-secret-gemini',
 KILO_API_KEY:'synthetic-secret-kilo',OPENROUTER_API_KEY:'synthetic-secret-openrouter',
 MISTRAL_API_KEY:'synthetic-secret-mistral',OLLAMA_API_KEY:'synthetic-secret-ollama'
};
const named=rows=>Object.fromEntries(rows.map(row=>[row.provider,row]));
test('retained provider configuration is secrets-free and removed providers are absent',()=>{
 const rows=providerConfigurationSnapshot(keys),map=named(rows);
 assert.deepEqual(rows.map(row=>row.provider),SYNTHETIC_PROVIDER_IDS);
 for(const value of Object.values(keys))assert.ok(!JSON.stringify(rows).includes(value));
 for(const p of ['cloudflare','gemini','kilo','openrouter','ollama'])assert.equal(map[p],undefined);
 assert.equal(map.groq.routerEnvironmentEligible,true);
 assert.equal(map.ollama,undefined);
});
test('retired Ollama flags never substitute for an active provider',()=>{
 const rows=providerConfigurationSnapshot({...keys,LOUREX_AI_NEW_PROVIDERS_ENABLED:'true',LOUREX_AI_OLLAMA_FREE_VERIFIED:'true'});
 assert.deepEqual(rows.map(r=>r.provider),['groq']);
 assert.ok(providerConfigurationSnapshot({}).every(row=>!row.configured&&!row.syntheticProbeAllowed));
});
test('owner-only inventory is separate from manual inference and UI is fully wired',()=>{
 const api=src('api/ai-core.js'),js=src('public/health.js'),html=src('public/health.html');
 const start=api.indexOf("request.headers['x-lourex-admin-diagnostics']==='provider-inventory'");
 const owner=api.indexOf('diagnosticsOwnerUidAllowed(',start);
 const output=api.indexOf('providerConfigurationSnapshot()',owner);
 const next=api.indexOf("request.headers['x-lourex-admin-diagnostics']==='provider-probe'",output);
 assert.ok(start>0&&owner>start&&output>owner&&next>output);
 assert.doesNotMatch(api.slice(start,next),/runSyntheticProviderDiagnostic|checkProviderCredential/);
 assert.match(js,/loadProviderInventory\(\)/);
 assert.match(js,/currentUser\?\.uid!==uid/);
 for(const p of SYNTHETIC_PROVIDER_IDS)assert.ok(html.includes('data-provider-config="'+p+'"'));
 assert.match(html,/<main hidden>/);
});
