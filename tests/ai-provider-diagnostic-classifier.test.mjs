import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classifySyntheticProviderAnswer} from '../api/_ai/provider-diagnostic-classifier.js';
const reply=(content,finish_reason='stop',model='openai/gpt-oss-120b')=>({model,choices:[{message:{content},finish_reason}]});
test('retained text diagnostics grade Arabic/English digits without inventing success',()=>{
 for(const text of ['1062','1,062.00','USD 1,062.00','الإجمالي ١٠٦٢','The total is 1062.00 USD']){
 const r=classifySyntheticProviderAnswer(reply(text),'groq');assert.equal(r.status,'PASSED');assert.equal(r.reportedTotal,1062);
 }const wrong=classifySyntheticProviderAnswer(reply('1000'),'groq');assert.equal(wrong.status,'WRONG_ANSWER');assert.equal(wrong.reportedTotal,1000);
 const multiple=classifySyntheticProviderAnswer(reply('8 x 125 = 1000; final1062'),'groq');assert.equal(multiple.status,'ANSWER_FORMAT');assert.equal(multiple.reason,'MULTIPLE_NUMBERS');
});
test('truncated or blocked correct-looking responses are never accepted',()=>{
 for(const finish of ['length','max_tokens','max_output_tokens','content_filter']){
 const r=classifySyntheticProviderAnswer(reply('1062',finish),'groq');assert.notEqual(r.status,'PASSED');assert.equal(r.reportedTotal,undefined);
 }const empty=classifySyntheticProviderAnswer(reply(null,'length'),'groq');assert.equal(empty.status,'OUTPUT_TRUNCATED');assert.equal(empty.reason,'EMPTY_CONTENT');
});
test('Ollama response shape and untrusted metadata stay bounded',()=>{
 const r=classifySyntheticProviderAnswer({model:'gemma4:31b',message:{content:'1062'},done_reason:'stop'},'ollama');assert.equal(r.status,'PASSED');assert.equal(r.actualModel,'gemma4:31b');
 const hostile=classifySyntheticProviderAnswer(reply('1062','stop','bad<script>'),'groq');assert.equal(hostile.actualModel,undefined);
 const bad=classifySyntheticProviderAnswer({error:{message:'SECRET_UPSTREAM_ERROR'}},'groq');assert.equal(bad.status,'PROVIDER_ERROR');assert.doesNotMatch(JSON.stringify(bad),/SECRET/);
});
test('parsed content arrays remain readable without extra calls',()=>{
 const r=classifySyntheticProviderAnswer(reply([{type:'text',text:{value:'1062'}}]),'groq');assert.equal(r.status,'PASSED');
});
test('diagnostic UI retains owner gate and text-only rendering',async()=>{
 const s=await readFile(new URL('../public/health.js',import.meta.url),'utf8');assert.match(s,/if\(!await ownerPermission\(\)\)/);assert.match(s,/result\.textContent=label/);assert.doesNotMatch(s,/result\.innerHTML\s*=/);
});
