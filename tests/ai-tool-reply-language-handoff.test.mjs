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
    const context=vm.createContext({host,input:{message,language:site,context:{}},toolResult:result,
      currentConversationMode:()=> 'controller',currentAiExperiencePreferences:()=>({replyLanguage:preference}),resolveAiConversationReplyLanguage,
      orchestrateAiToolRequest:async()=>result,resumeVaultSession:async()=>({vault:{}}),scopeFor:()=>scope,kernelScopeKey:s=>JSON.stringify(s),foundationToolOutcomes:()=>[],
      __lourexNaturalizeToolAnswer:(_result,locale)=>locale,
    });
    vm.runInContext(runtime.slice(start,end),context);
    await context.runIntelligenceTools(host,context.input);
    assert.equal(result.foundationReplyLanguage,expected);
    assert.equal(vm.runInContext('(function(){return '+expression+';}).call(host)',context),expected);
  }
});
