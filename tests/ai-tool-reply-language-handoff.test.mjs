import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolveAiConversationReplyLanguage} from '../dist/src/lib/ai-conversation-mode.js';

const runtime=readFileSync('dist/src/lib/ai-intelligence-runtime.js','utf8');
const start=runtime.indexOf('async function runIntelligenceTools(');
const end=runtime.indexOf('function stampProposal(',start);
assert.ok(start>=0&&end>start);

test('actual tool runtime and final chat formatter honor question/answer preference instead of site language',async()=>{
  const copilot=readFileSync('dist/src/components/AiCopilot.js','utf8');
  const expression=copilot.match(/__lourexNaturalizeToolAnswer\(toolResult, toolResult\.foundationReplyLanguage \|\| \(this\.props\.language === 'ar' \? 'ar' : 'en'\)\)/)?.[0];
  assert.ok(expression,'the final formatter must consume the resolved tool reply locale');
  for(const [site,message,preference,expected] of [['ar','Open products','auto','en'],['en','افتح المنتجات','auto','ar'],['ar','افتح المنتجات','en','en']]){
    const result={answer:'',results:[],plan:{calls:[]}},scope={accountId:'a',workspaceId:'w',branchId:'b',threadId:'t'};
    const host={__intelligenceKernel:{scope},props:{language:site}};
    const context=vm.createContext({host,input:{message,language:site,context:{}},toolResult:result,performance,recordStageDiagnostic:()=>{},
      currentConversationMode:()=> 'controller',currentAiExperiencePreferences:()=>({replyLanguage:preference,interfaceLanguage:'en'}),resolveAiConversationReplyLanguage,
      orchestrateAiToolRequest:async()=>result,resumeVaultSession:async()=>({vault:{}}),scopeFor:()=>scope,kernelScopeKey:s=>JSON.stringify(s),foundationToolOutcomes:()=>[],
      // The real async-ownership guard is covered by the dedicated 1139 test.
      captureTurn:h=>({scope:JSON.stringify(h.__intelligenceKernel.scope),controller:new AbortController()}),
      assertTurn:()=>{},ownsTurn:()=>true,awaitTurn:async(_h,_owner,fn)=>fn(),changedTurn:()=>new Error('Conversation changed'),
      __lourexNaturalizeToolAnswer:(_result,locale)=>locale,
    });
    const uiStart=runtime.indexOf('export function currentAiInterfaceLanguage(');
    const uiEnd=runtime.indexOf('\n}',uiStart)+2;
    assert.ok(uiStart>=0&&uiEnd>uiStart);
    vm.runInContext(runtime.slice(uiStart,uiEnd).replace('export function','function'),context);
    vm.runInContext(runtime.slice(start,end),context);
    await context.runIntelligenceTools(host,context.input);
    assert.equal(result.foundationReplyLanguage,expected);
    assert.equal(result.foundationInterfaceLanguage,'en','interface locale stays independent from answer and site');
    assert.equal(vm.runInContext('(function(){return '+expression+';}).call(host)',context),expected);
  }
});
