import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';

const at=date=>`${date}T12:00:00.000Z`;
function task(overrides={}){return{id:overrides.id||'task-1',scope:overrides.scope||'business',workspaceId:overrides.scope==='personal'?'':(overrides.workspaceId??'default'),branchId:overrides.scope==='personal'?'':(overrides.branchId??'main'),title:overrides.title||'Follow up',notes:overrides.notes||'',dueAt:overrides.dueAt??at('2026-10-03'),recurrence:overrides.recurrence||'none',conditionType:overrides.conditionType||'none',conditionValue:overrides.conditionValue||'',timezone:'Europe/Istanbul',relatedEntityType:overrides.relatedEntityType||'',relatedEntityId:overrides.relatedEntityId||'',sourceThreadId:'thread',sourceMessageId:'message',status:overrides.status||'open',completedAt:'',snoozedUntil:overrides.snoozedUntil||'',createdAt:at('2026-10-01'),updatedAt:at('2026-10-01')};}
function preferences(overrides={}){return{version:1,mutedCategories:[],dismissed:[],snoozed:[],morningBriefEnabled:true,updatedAt:at('2026-10-04'),...overrides};}

test('Batch 7 uses one canonical proactive engine and keeps Personal tasks separate from business signals',async()=>{
  const {emptyVault}=await import('../dist/src/lib/defaults.js');
  const {buildMorningBrief}=await import('../dist/src/lib/ai-proactive-assistant.js');
  const vault=emptyVault();
  const brief=buildMorningBrief(vault,preferences(),[task({id:'personal',scope:'personal',title:'Call family'}),task({id:'business',scope:'business',title:'Business task'})],'2026-10-04');
  assert.deepEqual(brief.personalTasks.map(row=>row.id),['personal']);
  assert.equal(brief.business.every(row=>!row.key.startsWith('personal:')),true);
  const files=await readdir(new URL('../src/lib/',import.meta.url));
  assert.equal(files.includes('proactive-assistant.ts'),false,'duplicate proactive engine must not return');
  assert.ok(files.includes('ai-proactive-assistant.ts'));
});

test('Conditional business tasks trigger only from deterministic current records',async()=>{
  const {emptyVault}=await import('../dist/src/lib/defaults.js');
  const {evaluateConditionalTask,conditionalTaskSignals}=await import('../dist/src/lib/ai-proactive-assistant.js');
  const vault=emptyVault();
  vault.savedItems=[{id:'item-1',workspaceId:'default',branchId:'main',createdAt:at('2026-01-01'),updatedAt:at('2026-01-01'),sku:'SKU-1',descriptionEn:'Test Item',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'10',lastCurrency:'USD',lastUnitCost:'8',lastCostCurrency:'USD',usageCount:0,lastUsedAt:'',category:'',tags:[],favorite:false}];
  vault.inventoryMovements=[{id:'mov-1',workspaceId:'default',branchId:'main',itemId:'item-1',itemNameEn:'Test Item',itemNameAr:'',sku:'SKU-1',date:'2026-10-01',type:'opening',quantity:'2',unitCost:'8',currency:'USD',sourceId:'',sourceNumber:'',note:'',createdAt:at('2026-10-01')}];
  const below=task({id:'below',conditionType:'stock-below',conditionValue:'5',relatedEntityType:'product',relatedEntityId:'item-1'}),notBelow=task({id:'not-below',conditionType:'stock-below',conditionValue:'1',relatedEntityType:'product',relatedEntityId:'item-1'}),missing=task({id:'missing-doc',conditionType:'document-not-converted',conditionValue:'missing-document'});
  assert.equal(evaluateConditionalTask(vault,below,'2026-10-04').triggered,true);
  assert.equal(evaluateConditionalTask(vault,notBelow,'2026-10-04').triggered,false);
  assert.equal(evaluateConditionalTask(vault,missing,'2026-10-04').triggered,false,'missing record must never create a guessed alert');
  assert.deepEqual(conditionalTaskSignals(vault,[below,notBelow,missing],'2026-10-04').map(row=>row.key),['conditional-task:below']);
});

test('Proactive preferences are encrypted, bounded and severity mute is deterministic',async()=>{
  const {normalizeProactiveState,proactiveSignalVisible}=await import('../dist/src/storage/assistant-proactive-store.js');
  const state=normalizeProactiveState({version:1,mutedCategories:['attention','invalid'],dismissed:[],snoozed:[],morningBriefEnabled:true,updatedAt:at('2026-10-04')});
  assert.deepEqual(state.mutedCategories,['attention']);
  assert.equal(proactiveSignalVisible(state,{key:'one',category:'attention'}),false);
  assert.equal(proactiveSignalVisible(state,{key:'two',category:'opportunity'}),true);
  const [store,engine]=await Promise.all([readFile(new URL('../src/storage/assistant-proactive-store.ts',import.meta.url),'utf8'),readFile(new URL('../src/lib/ai-proactive-assistant.ts',import.meta.url),'utf8')]);
  assert.match(store,/AES-GCM/);assert.match(store,/dismissProactiveSignal/);assert.match(store,/snoozeProactiveSignal/);assert.match(store,/setProactiveCategoryMuted/);
  assert.doesNotMatch(store,/localStorage|sessionStorage/);
  assert.doesNotMatch(engine,/convertedTotal|combinedCurrency|grandTotalAcrossCurrencies/i);
  assert.match(engine,/Supplier obligations remain separated by currency/);
});

test('Proactive intelligence keeps canonical refresh behavior while persistent UI is consolidated into one Tools hub',async()=>{
  const [dock,daily,placement]=await Promise.all([readFile(new URL('../src/components/ProactiveAssistantTool.tsx',import.meta.url),'utf8'),readFile(new URL('../src/components/DailyCommandCenterTool.tsx',import.meta.url),'utf8'),readFile(new URL('../scripts/ai-batch7-placement-repair.mjs',import.meta.url),'utf8')]);
  const canonicalImports=dock.match(/from '\.\.\/lib\/ai-proactive-assistant\.js'/g)??[];
  assert.equal(canonicalImports.length,1,'proactive runtime must import the canonical proactive engine exactly once');
  assert.match(dock,/lourex-ai-open-daily/);
  assert.match(dock,/loadProactiveState/);assert.match(dock,/dismissProactiveSignal/);assert.match(dock,/snoozeProactiveSignal/);assert.match(dock,/setProactiveCategoryMuted/);
  assert.match(dock,/lourex-account-transition-complete/,'proactive assistant must refresh as soon as an account Vault session becomes available');
  assert.match(dock,/lourex-proactive-refresh/,'proactive assistant must expose a bounded explicit refresh event for verified runtime transitions');
  for(const token of ['buildMorningBrief','conditionalTaskSignals','visibleProactiveSignals','Dismiss','Mute category','Morning Brief enabled'])assert.match(daily,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(daily,/handleModalEscape/,'Morning Brief must own Escape while its modal is open');
  assert.match(daily,/addEventListener\('keydown',this\.handleModalEscape,true\)/,'Morning Brief Escape isolation must run in capture phase before the underlying assistant');
  assert.match(daily,/event\.stopPropagation\(\)/,'closing Morning Brief must not close the assistant behind it');
  assert.match(daily,/setProactiveCategoryMuted\(resumed\.key,category,muted\)/,'mute/unmute must pass the requested state');
  assert.doesNotMatch(daily,/setProactiveCategoryMuted\(resumed\.key,category,true\)/,'Unmute must not be hard-coded back to mute');
  for(const token of ['lourex-ai-tools','lourex-ai-manager-button','lourex-proactive-dock','display:none','lourex-ai-hub-trigger','lourex-ai-hub-menu','data-lourex-proactive-attention','lourex-ai-open-daily'])assert.match(placement,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(placement,/one assistant, one control hierarchy/i);
  assert.match(placement,/one Tools hub/i);
});

test('Batch 7 voice extends existing recognizer lifecycle and leaves transcript editable',async()=>{
  const installer=await readFile(new URL('../scripts/ai-batch7-proactive-voice.mjs',import.meta.url),'utf8');
  assert.match(installer,/normalizeVoiceTranscript/);assert.match(installer,/[٠-٩]/);assert.match(installer,/[۰-۹]/);assert.match(installer,/Transcript ready — edit or send/);assert.match(installer,/lourex-ai-voice-retry/);assert.match(installer,/toggleVoice\(panel\)/);assert.match(installer,/--check/);
  assert.match(installer,/voiceHadResult\?5000/,'successful transcript status must remain visible long enough to review/edit on WebKit and mobile');
  assert.match(installer,/voiceHadResult\?'voiceAdded':'voiceStopped'/,'manual stop with an existing transcript must report that the transcript is ready rather than pretending it was discarded');
  assert.doesNotMatch(installer,/requestSubmit\(\)|\.submit\(\)/,'voice must populate an editable composer and never auto-submit');
});

test('Batch 7 adds no Serverless Function, installs placement repair last, and stays inside Vercel Hobby budget',async()=>{
  const pkg=await readFile(new URL('../package.json',import.meta.url),'utf8');
  assert.match(pkg,/ai-batch6-personal-memory-tasks\.mjs && node scripts\/ai-batch7-proactive-voice\.mjs && node scripts\/ai-batch7-placement-repair\.mjs/);
  const apiFiles=(await readdir(new URL('../api/',import.meta.url))).filter(name=>name.endsWith('.js')&&!name.startsWith('_'));
  assert.ok(apiFiles.length<=12,`Vercel Hobby supports at most 12 top-level Serverless Functions; found ${apiFiles.length}`);
});
