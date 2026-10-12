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
  assert.match(code,/conversationMode=body\?\.context\?\.conversationMode==='controller'\?'controller':'advisor'/);
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
  assert.match(code,/conversationMode=body\?\.context\?\.conversationMode==='controller'\?'controller':'advisor'/);
  assert.match(code,/cleanResult\(routed\.data,cleaned\.context\.conversationMode\)/);
  assert.match(code,/aiResponseDetail=cleanEnum/);
});

test('Client carries restrictive mode through the server request without changing auth',()=>{
  const runtime=src('src/lib/ai-intelligence-runtime.ts');
  assert.match(runtime,/context\.conversationMode=currentConversationMode\(host\)/);
  assert.match(runtime,/conversationMode:requestedMode/);
  assert.match(runtime,/requestedMode!==currentConversationMode\(host\)/);
});

test('Server sanitizers do not promote missing or malformed mode into Controller',()=>{
  const tests=[
    ['api/ai-core.js',{finance:[],business:[],pricing:[],drafting:[]},
      ['cleanFinance','cleanBusiness','cleanPricing','cleanDrafting','ALLOWED_CAPABILITIES']],
    ['api/ai-advisor-v2.js',{advisorV2:{}},['cleanAdvisor']],
  ];
  for(const [path,fields,names] of tests){
    const code=src(path);
    const dependencies={
      MAX_MESSAGE_CHARS:6000,
      SCREENS:new Set(['home']),
      cleanEnum:(value,values,fallback)=>values.includes(value)?value:fallback,
      cleanFinance:()=>({asOf:'2026-10-12'}),
      cleanBusiness:()=>({asOf:'2026-10-12'}),
      cleanPricing:()=>({}),
      cleanDrafting:()=>({}),
      cleanAdvisor:()=>({version:2}),
      ALLOWED_CAPABILITIES:[],
    };
    const keys=Object.keys(dependencies);
    const sanitize=new Function(...keys,line(code,'function cleanRequest(')+';return cleanRequest;')(...keys.map(key=>dependencies[key]));
    for(const mode of [undefined,null,'operator','invalid','']){
      const body={message:'Analyze purchasing options',context:{version:5,screen:'home',language:'en',conversationMode:mode,...fields}};
      assert.equal(sanitize(body)?.context.conversationMode,'advisor',path+' '+String(mode));
    }
    const authorized={message:'Analyze purchasing options',context:{version:5,screen:'home',conversationMode:'controller',...fields}};
    assert.equal(sanitize(authorized)?.context.conversationMode,'controller',path);
    assert.match(code,/hypothetical|hypothetically/i,'Advisor system instruction must facilitate discussion rather than just refuse');
  }
});
