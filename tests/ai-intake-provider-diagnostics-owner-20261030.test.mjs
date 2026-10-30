import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {intakeDiagnostics} from '../api/_ai/intake-diagnostics.js';

const owner='a'.repeat(28);
const attempt={provider:'groq',model:'openai/gpt-oss-120b',category:'timeout',latencyMs:11220,
 fallbackIndex:0,attempt:1,secret:'PRIVATE_API_KEY',prompt:'PRIVATE_CUSTOMER_DATA',
 headers:{Authorization:'PRIVATE_API_KEY'}};

test('file intake diagnostic is authorized only by verified server UID, never by flags or role',()=>{
 for(const uid of ['b'.repeat(28),'',null,undefined]){
   const trace=intakeDiagnostics(uid,'quote-extraction',owner);
   assert.equal(trace.onDiagnostic,undefined);
   assert.deepEqual(trace.failure({requestId:'req-1',eligibleModelCount:4,availableModelCount:0}),{requestId:'req-1'});
 }
 const allowed=intakeDiagnostics(owner,'quote-extraction',owner);
 assert.equal(typeof allowed.onDiagnostic,'function');
 const invalidStage=intakeDiagnostics(owner,'PRIVATE',owner);
 assert.equal(invalidStage.onDiagnostic,undefined);
 assert.deepEqual(invalidStage.failure({requestId:'req-1'}),{requestId:'req-1'});
});

test('provider attempt evidence excludes credentials, source data and unknown provider/error payloads',()=>{
 const diag=intakeDiagnostics(owner,'source-classification',owner);
 diag.onDiagnostic(attempt);
 diag.onDiagnostic({...attempt,provider:'PRIVATE_PROVIDER',category:'upstream'});
 diag.onDiagnostic({...attempt,provider:'gemini',category:'PRIVATE_ERROR'});
 diag.onDiagnostic({...attempt,provider:'cloudflare',category:'rate_limit',latencyMs:800,retryAfterMs:60000,quotaScope:'provider'});
 const result=diag.failure({requestId:'abc-123',totalLatencyMs:13000,eligibleModelCount:7,availableModelCount:2,token:'PRIVATE_API_KEY'});
 assert.equal(result.diagnostic.stage,'source-classification');
 assert.equal(result.diagnostic.attempts.length,2);
 assert.equal(result.diagnostic.availableModelCount,2);
 assert.deepEqual(result.diagnostic.attempts[0],{
   provider:'groq',category:'timeout',latencyMs:11220,model:'openai/gpt-oss-120b',fallbackIndex:0
 });
 assert.equal(result.diagnostic.attempts[1].quotaScope,'provider');
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|Authorization|token|headers|prompt|secret/);
});

test('missing eligible models and circuit-open counts remain visible with no actual provider call',()=>{
 const trace=intakeDiagnostics(owner,'source-summary',owner);
 const zero=trace.failure({requestId:'req-zero',totalLatencyMs:5,eligibleModelCount:0,availableModelCount:0});
 assert.deepEqual(zero.diagnostic.attempts,[]);
 assert.equal(zero.diagnostic.eligibleModelCount,0);
 const unavailable=trace.failure({eligibleModelCount:6,availableModelCount:0});
 assert.equal(unavailable.diagnostic.availableModelCount,0);
 assert.equal(trace.failure({requestId:'evil\nsecret'}).requestId,undefined);
});

test('browser owner diagnostics explain zero eligible models and timed-out fallback without exposing arbitrary content',()=>{
 const source=readFileSync('src/lib/ai-request.ts','utf8').replace(/^import .*;$/gm,'');
 const ctx={exports:{},t:(_en,ar)=>ar};
 vm.runInNewContext(ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),ctx);
 const zero=ctx.exports.aiOwnerDiagnosticSummary({stage:'source-classification',eligibleModelCount:0,availableModelCount:0,attempts:[]});
 assert.match(zero,/تصنيف الملف/);
 assert.match(zero,/الموديلات المؤهلة 0/);
 const diagnostic=ctx.exports.aiOwnerDiagnosticSummary({stage:'quote-extraction',eligibleModelCount:5,availableModelCount:2,
   attempts:[{provider:'groq',model:'openai/gpt-oss-120b',category:'timeout',latencyMs:11220,
      prompt:'PRIVATE',secret:'PRIVATE_API_KEY'}]});
 assert.match(diagnostic,/groq: timeout 11220ms/);
 assert.match(diagnostic,/الموديلات المؤهلة 5/);
 assert.doesNotMatch(diagnostic,/PRIVATE|API_KEY/);
});

test('authenticated classification, summary, quotation extraction all use server-side owner-only capture',()=>{
 const inbox=readFileSync('api/ai-inbox.js','utf8');
 const quote=readFileSync('api/quote-source-ai.js','utf8');
 for(const stage of ['source-summary','source-classification']){
   assert.ok(inbox.includes('intakeDiagnostics(request.aiVerifiedUid,'+"'"+stage+"'"+')'));
 }
 assert.ok(quote.includes("intakeDiagnostics(request.aiVerifiedUid,'quote-extraction')"));
 assert.match(inbox,/onDiagnostic:diagnostic\.onDiagnostic/);
 assert.match(quote,/onDiagnostic:diagnostic\.onDiagnostic/);
 assert.match(inbox,/diagnostic\.failure\(result\)|diagnostic\.failure\(routed\)/);
 assert.match(quote,/diagnostic\.failure\(result\)/);
 assert.doesNotMatch(inbox,/intakeDiagnostics\(body/);
 assert.doesNotMatch(quote,/intakeDiagnostics\(body/);
});
