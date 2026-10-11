import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const line=(source,start)=>{
  const result=source.split('\n').find(value=>value.startsWith(start));
  assert.ok(result,'Server mode policy implementation disappeared: '+start);
  return result;
};

test('Core discards any draft/navigation proposal when the user is in Advisor mode',()=>{
  const code=src('api/ai-core.js');
  const resultForRequest=new Function('cleanAiResult','claimedDraftCreation','previewOnlyDocumentRequested','draftActionRequested',
    line(code,'function resultForRequest(')+';return resultForRequest;')(
      value=>({answer:value.answer,proposal:value.proposal}),
      value=>/created|saved/i.test(value),()=>false,()=>false);
  const draft={capability:'document.createDraft'};
  const advisor={context:{conversationMode:'advisor',language:'en'},message:'create draft'};
  const controller={context:{conversationMode:'controller',language:'en'},message:'create draft'};
  assert.equal(resultForRequest({answer:'I can prepare it',proposal:draft},advisor).proposal,null);
  assert.match(resultForRequest({answer:'Created and saved',proposal:draft},advisor).answer,/did not create or save/);
  assert.equal(resultForRequest({answer:'Proposal ready',proposal:draft},controller).proposal,draft);
  const strictResultForRequest=new Function('cleanAiResult','claimedDraftCreation','previewOnlyDocumentRequested','draftActionRequested',
    line(code,'function resultForRequest(')+';return resultForRequest;')(
      value=>value.proposal?.capability==='INVALID'?null:{answer:value.answer,proposal:value.proposal},
      value=>/created|saved/i.test(value),()=>false,()=>false);
  assert.equal(strictResultForRequest({answer:'Here is the analysis',proposal:{capability:'INVALID'}},advisor).proposal,null);
  assert.equal(strictResultForRequest({answer:'Ready',proposal:{capability:'INVALID'}},controller),null);
  assert.match(code,/conversationMode=body\?\.context\?\.conversationMode==='advisor'/);
  assert.match(code,/aiResponseDetail=cleanEnum/);
  assert.match(code,/modeInstruction/);
});

test('Advisor V2 never returns a navigation proposal even if Gemini generates one',()=>{
  const code=src('api/ai-advisor-v2.js');
  const cleanResult=new Function('cleanText','cleanProposal',line(code,'function cleanResult(')+';return cleanResult;')(
    value=>String(value||'').slice(0,4000),value=>value);
  const proposal={capability:'workspace.navigate',target:'documents',label:'Open documents'};
  assert.deepEqual(cleanResult({answer:'Here is the analysis',proposal},'advisor'),{
    answer:'Here is the analysis',proposal:null,
  });
  assert.equal(cleanResult({answer:'You may open it',proposal},'controller').proposal,proposal);
  assert.match(code,/conversationMode=body\?\.context\?\.conversationMode==='advisor'/);
  assert.match(code,/cleanResult\(routed\.data,cleaned\.context\.conversationMode\)/);
  assert.match(code,/aiResponseDetail=cleanEnum/);
});

test('Client carries restrictive mode through the server request without changing auth',()=>{
  const runtime=src('src/lib/ai-intelligence-runtime.ts');
  assert.match(runtime,/context\.conversationMode=currentConversationMode\(host\)/);
  assert.match(runtime,/conversationMode:requestedMode/);
  assert.match(runtime,/requestedMode!==currentConversationMode\(host\)/);
});
