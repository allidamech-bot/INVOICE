import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDiagnosticRateLimiter,DIAGNOSTIC_RATE_MAX_PER_PROVIDER,DIAGNOSTIC_RATE_WINDOW_MS} from '../api/_ai/diagnostics-rate-limit.js';

test('five or more diagnostic requests do not globally block the four providers',()=>{
  const check=createDiagnosticRateLimiter();
  const uid='SyntheticOwnerUid9876543210';
  const providers=['groq','cloudflare','gemini','kilo'];
  for(const provider of providers){
    for(let i=0;i<5;i++)assert.equal(check(uid,provider,1000).allowed,true,provider+' request '+(i+1));
  }
  for(const provider of providers)assert.equal(check(uid,provider,1000).allowed,true,provider+' should retain independent budget');
});

test('provider-specific limit blocks only that provider and reports actual retry time',()=>{
  assert.equal(DIAGNOSTIC_RATE_MAX_PER_PROVIDER,12);
  const check=createDiagnosticRateLimiter();
  const uid='SyntheticOwnerUid1234567890',start=100000;
  for(let i=0;i<12;i++){
    const v=check(uid,'groq',start);
    assert.equal(v.allowed,true);
    assert.equal(v.remaining,11-i);
  }
  assert.deepEqual(check(uid,'groq',start+2*60000),{allowed:false,retryAfterSeconds:480});
  for(const provider of ['cloudflare','gemini','kilo'])assert.equal(check(uid,provider,start+2*60000).allowed,true);
  assert.equal(check('OtherUserUid1234567890','groq',start+2*60000).allowed,true);
  assert.equal(check(uid,'groq',start+DIAGNOSTIC_RATE_WINDOW_MS).allowed,true,'quota resets at ten minutes');
});

test('malformed rate-limit identifiers cannot consume a valid provider budget',()=>{
 const check=createDiagnosticRateLimiter();
 for(const provider of [null,'',undefined])assert.equal(check('u',provider).allowed,false);
 assert.equal(check('u','gemini').allowed,true);
 assert.equal(check('u','groq').allowed,true);
});

test('owner authentication and provider allowlist precede diagnostic quota usage',()=>{
 const core=readFileSync(new URL('../api/ai-core.js',import.meta.url),'utf8');
 const start=core.indexOf("if(request.headers['x-lourex-admin-diagnostics']==='provider-probe')");
 const end=core.indexOf("  if(!rateAllowed(request))",start);
 assert.ok(start>0&&end>start);
 const branch=core.slice(start,end);
 const owner=branch.indexOf('diagnosticsOwnerUidAllowed(');
 const input=branch.indexOf('readJson(request)');
 const allowlist=branch.indexOf('SYNTHETIC_PROVIDER_IDS.includes(provider)');
 const rate=branch.indexOf('diagnosticRateAllowed(request.aiVerifiedUid,provider)');
 assert.ok(owner>=0&&input>owner&&allowlist>input&&rate>allowlist,'owner, input validation and exact provider must be checked before quota');
 assert.match(branch,/code:'DIAGNOSTIC_RATE_LIMITED',provider,retryAfterSeconds:testBudget.retryAfterSeconds/);
 assert.doesNotMatch(branch,/rateAllowed\(request\)/);
 const html=readFileSync(new URL('../public/health.html',import.meta.url),'utf8');
 const script=readFileSync(new URL('../public/health.js',import.meta.url),'utf8');
 assert.match(html,/up to 12 times within 10 minutes independently/);
 assert.match(script,/data\?\.code==='DIAGNOSTIC_RATE_LIMITED'/);
 assert.match(script,/Provider rate limit/);
});
