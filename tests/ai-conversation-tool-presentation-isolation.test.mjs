import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const compiled=readFileSync('dist/src/components/AiConversationWorkspace.js','utf8');
const start=compiled.indexOf('export function clearConversationToolPresentation(');
const end=compiled.indexOf('export function renderConversationWorkspace(',start);
assert.ok(start>=0&&end>start);
const context=vm.createContext({});
vm.runInContext(compiled.slice(start,end).replace('export function','function'),context);

test('switching context clears transient tool data without deleting persisted thread evidence',()=>{
  const kernel={toolEvidence:[{toolId:'finance.getSummary',data:{currency:'USD'}}]};
  const host={__lourexToolPresentation:{rows:[{label:'other thread'}]},__lourexLastToolAudit:'previous audit',__foundationToolOutcomes:[{data:{private:'previous scope'}}],__intelligenceKernel:kernel};
  context.clearConversationToolPresentation(host);
  assert.equal(host.__lourexToolPresentation,null);
  assert.equal(host.__lourexLastToolAudit,'');
  assert.equal(host.__foundationToolOutcomes.length,0);
  assert.equal(host.__intelligenceKernel,kernel);
  assert.equal(kernel.toolEvidence.length,1);
});

test('all conversation lifecycle transitions and account/workspace changes clear transient presentation first',()=>{
  assert.match(compiled,/for \(const name of \['__lourexSetScope', '__lourexOpenThread', '__lourexNewConversation', '__lourexDeleteThread'\]\)/);
  assert.match(compiled,/clearConversationToolPresentation\(host\);[\s\S]*?await old\(\.\.\.args\)/);
  assert.match(compiled,/if \(previous !== host.props\) \{\s*clearConversationToolPresentation\(host\)/);
});

test('successful and failed mode switches render the final unlocked controls after releasing the guard',async()=>{
  const start=compiled.indexOf('host.__workspaceSwitchMode = async');
  const end=compiled.indexOf('host.__workspaceRefresh = refresh;',start);
  assert.ok(start>=0&&end>start);
  for(const fail of [false,true]){
    const frames=[];
    const host={state:{input:'unsent controller draft'},__intelligenceKernel:{mode:'controller',scope:{scope:'business',threadId:'controller'}},__businessThreads:[{id:'advisor',mode:'advisor',updatedAt:'2026-10-12'}],
      setState(patch){Object.assign(this.state,patch);frames.push({busy:Boolean(this.__workspaceModeSwitchBusy),switching:this.state.__workspaceSwitching});},
      async __lourexOpenThread(){if(fail)throw new Error('storage unavailable');this.__intelligenceKernel={mode:'advisor',scope:{scope:'business',threadId:'advisor'}};},
    };
    const switchContext=vm.createContext({host,drafts:new Map(),disabled:h=>Boolean(h.__workspaceModeSwitchBusy),normalizeAiConversationMode:m=>m,kernelScopeKey:s=>s.threadId,assignIntelligenceConversationMode:async()=>{}});
    vm.runInContext(compiled.slice(start,end),switchContext);
    await host.__workspaceSwitchMode('advisor');
    assert.equal(frames.at(-1).busy,false);
    assert.equal(frames.at(-1).switching,false);
    assert.equal(host.__workspaceInternalModeSwitch,false);
    if(fail)assert.match(host.state.error,/storage unavailable/);
  }
});
