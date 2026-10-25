import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {kernelScopeKey} from '../dist/src/lib/ai-conversation-kernel.js';
import {normalizeAiConversationMode} from '../dist/src/lib/ai-conversation-mode.js';

async function fixture(mode='advisor',internal=false,overrides={}){
 const source=await readFile('dist/src/components/AiConversationWorkspace.js','utf8');
 const start=source.indexOf('const drafts = new Map();'),end=source.indexOf('// Each mode opens',start);
 assert.ok(start>0&&end>start,'execute the actual compiled navigation wrapper');
 const scope={accountId:'synthetic-account',scope:'business',workspaceId:'default',branchId:'main',threadId:'old'};
 const next={mode:'controller',scope:{...scope,threadId:'new',...overrides}};
 let creates=0;const assigned=[];
 const h={props:{},__intelligenceKernel:{mode,scope},__lourexAssistantThreadId:'old',__workspaceInternalModeSwitch:internal,state:{input:'unsent synthetic draft'},setState(v){Object.assign(this.state,v);},async __lourexNewConversation(){creates++;this.__lourexAssistantThreadId=next.scope.threadId;}};
 const install=new Function('host','disabled','clearConversationToolPresentation','refresh','kernelScopeKey','normalizeAiConversationMode','assignIntelligenceConversationMode',source.slice(start,end));
 install(h,()=>false,()=>{},async()=>{h.__intelligenceKernel=next;h.__workspaceObservedProps=h.props;},kernelScopeKey,normalizeAiConversationMode,async(host,value)=>{assigned.push(value);host.__intelligenceKernel.mode=value;});
 await h.__lourexNewConversation();
 return{h,scope,assigned,creates};
}
test('upper-menu new conversation preserves Advisor mode and the departing draft',async()=>{
 const {h,scope,assigned,creates}=await fixture();
 assert.equal(creates,1);assert.deepEqual(assigned,['advisor']);assert.equal(h.__intelligenceKernel.mode,'advisor');
 assert.equal(h.__workspaceComposerDrafts.get(kernelScopeKey(scope)),'unsent synthetic draft');
 assert.equal(h.state.input,'');
});
test('Controller defaults and explicit mode switches retain their intended behavior',async()=>{
 for(const [mode,internal] of [['controller',false],['advisor',true]]){
  const {assigned,creates}=await fixture(mode,internal);assert.equal(creates,1);assert.deepEqual(assigned,[]);
 }
});
test('mode restoration fails closed for a reused or foreign conversation scope',async()=>{
 for(const overrides of [{threadId:'old'},{accountId:'foreign'},{workspaceId:'foreign'},{branchId:'foreign'}]){
  const {h,assigned}=await fixture('advisor',false,overrides);
  assert.deepEqual(assigned,[]);assert.ok(h.state.__workspaceLoadError);assert.equal(h.__workspaceObservedProps,undefined);
 }
});
