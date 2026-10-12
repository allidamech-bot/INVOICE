import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeAssistantState,upsertAssistantThread,
} from '../dist/src/storage/assistant-store.js';
import {
  DEFAULT_AI_CONVERSATION_PREFERENCES,normalizeAiConversationPreferences,resolveAiConversationReplyLanguage,
} from '../dist/src/lib/ai-conversation-mode.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('AI language and motion settings are independent from the site locale',()=>{
  const stored=normalizeAssistantState({version:1,threads:[],currentBusinessThreadId:'',currentPersonalThreadId:'',aiPreferences:{interfaceLanguage:'ar',replyLanguage:'en',detail:'brief',motion:'reduced',reviewVoiceTranscriptBeforeSend:true}});
  assert.equal(stored.aiPreferences.interfaceLanguage,'ar');
  assert.equal(stored.aiPreferences.replyLanguage,'en');
  assert.equal(stored.aiPreferences.motion,'reduced');
  assert.equal(stored.aiPreferences.detail,'brief');
  assert.deepEqual(normalizeAiConversationPreferences(null),DEFAULT_AI_CONVERSATION_PREFERENCES);
});

test('saving or switching AI threads preserves account AI preferences',()=>{
  const state=normalizeAssistantState({version:1,threads:[],aiPreferences:{interfaceLanguage:'en',replyLanguage:'ar',detail:'detailed',motion:'reduced'}});
  const first=upsertAssistantThread(state,{scope:'business',workspaceId:'default',branchId:'main',threadId:'controller-1',messages:[{role:'user',text:'Create a quote'}]});
  assert.equal(first.state.aiPreferences.interfaceLanguage,'en');
  assert.equal(first.state.aiPreferences.replyLanguage,'ar');
  const second=upsertAssistantThread(first.state,{scope:'business',workspaceId:'default',branchId:'main',threadId:'advisor-2',messages:[{role:'user',text:'Analyze revenue'}]});
  assert.deepEqual(second.state.aiPreferences,first.state.aiPreferences);
  const personal=upsertAssistantThread(second.state,{scope:'personal',workspaceId:'',branchId:'',threadId:'personal-3',messages:[{role:'user',text:'Hello'}]});
  assert.deepEqual(personal.state.aiPreferences,first.state.aiPreferences);
});

test('old or untrusted stored settings are sanitized and do not alter permissions',()=>{
  const old=normalizeAssistantState({version:1,threads:[]});
  assert.deepEqual(old.aiPreferences,DEFAULT_AI_CONVERSATION_PREFERENCES);
  const invalid=normalizeAssistantState({version:1,threads:[],aiPreferences:{interfaceLanguage:'javascript',replyLanguage:'execute',detail:'verbose-overflow',motion:'bounce',reviewVoiceTranscriptBeforeSend:'false'}});
  assert.deepEqual(invalid.aiPreferences,DEFAULT_AI_CONVERSATION_PREFERENCES);
});

test('settings are connected to encrypted account queue and real AI context',()=>{
  const store=read('src/storage/assistant-store.ts');
  const runtime=read('src/lib/ai-intelligence-runtime.ts');
  const ui=read('src/components/AiConversationWorkspace.tsx');
  const css=read('src/styles/ai-conversation-workspace.css');
  const menu=read('public/ai-composer-v449.js');
  assert.match(store,/aiPreferences:normalizeAiConversationPreferences\(value\.aiPreferences\)/);
  assert.match(store,/aiPreferences:normalized\.aiPreferences/);
  assert.match(runtime,/export async function updateAiExperiencePreferences/);
  assert.match(runtime,/storeQueue\.catch\(\(\)=>undefined\)\.then\(run\)/);
  assert.match(runtime,/resolveAiConversationReplyLanguage\(settings\.replyLanguage,latest/);
  assert.match(runtime,/resolveAiConversationReplyLanguage\(preferences\.replyLanguage,input\.message/);
  assert.match(runtime,/language:responseLanguage,context:/);
  assert.match(ui,/function AiExperienceSettings/);
  assert.match(ui,/interfaceLanguage/);
  assert.match(ui,/replyLanguage/);
  assert.match(ui,/__workspaceSettingsOpen/);
  assert.match(css,/\.lxw-settings-field\{/);
  assert.match(css, /data-ai-motion='reduced'/);
  assert.match(menu,/data-ai-motion/);
});

test('automatic language follows the actual conversation without changing the site',()=>{
  assert.equal(resolveAiConversationReplyLanguage('auto','حلل أرباح الشركة','en'),'ar');
  assert.equal(resolveAiConversationReplyLanguage('auto','Explain our profit margin','ar'),'en');
  assert.equal(resolveAiConversationReplyLanguage('auto','12345','ar'),'ar');
  assert.equal(resolveAiConversationReplyLanguage('ar','Explain our profit margin','en'),'ar');
  assert.equal(resolveAiConversationReplyLanguage('en','حلل الأرباح','ar'),'en');
});
