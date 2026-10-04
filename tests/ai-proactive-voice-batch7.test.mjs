import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';

const at=date=>`${date}T12:00:00.000Z`;
function task(overrides={}){return{id:overrides.id||'task-1',scope:overrides.scope||'business',workspaceId:overrides.scope==='personal'?'':(overrides.workspaceId??'default'),branchId:overrides.scope==='personal'?'':(overrides.branchId??'main'),title:overrides.title||'Follow up',notes:overrides.notes||'',dueAt:overrides.dueAt??at('2026-10-03'),recurrence:overrides.recurrence||'none',conditionType:overrides.conditionType||'none',conditionValue:overrides.conditionValue||'',timezone:'Europe/Istanbul',relatedEntityType:overrides.relatedEntityType||'',relatedEntityId:overrides.relatedEntityId||'',sourceThreadId:'thread',sourceMessageId:'message',status:overrides.status||'open',completedAt:'',snoozedUntil:overrides.snoozedUntil||'',createdAt:at('2026-10-01'),updatedAt:at('2026-10-01')};}

test('Batch 7 morning brief keeps Business and Personal tasks strictly separated',async()=>{
  const {emptyVault}=await import('../dist/src/lib/defaults.js');
  const {buildProactiveSnapshot}=await import('../dist/src/lib/proactive-assistant.js');
  const vault=emptyVault();
  const snapshot=buildProactiveSnapshot(vault,[task({id:'biz',scope:'business',title:'Business follow-up'}),task({id:'personal',scope:'personal',title:'Call family'})],{at:at('2026-10-04')});
  assert.ok(snapshot.business.signals.some(row=>row.taskId==='biz'));
  assert.equal(snapshot.business.signals.some(row=>row.taskId==='personal'),false);
  assert.ok(snapshot.personal.signals.some(row=>row.taskId==='personal'));
  assert.equal(snapshot.personal.signals.some(row=>row.taskId==='biz'),false);
  assert.equal(snapshot.personal.signals.every(row=>row.scope==='personal'),true);
  assert.equal(snapshot.business.signals.every(row=>row.scope==='business'),true);
});

test('Conditional tasks trigger only when deterministic conditions remain true',async()=>{
  const {emptyVault}=await import('../dist/src/lib/defaults.js');
  const {buildProactiveSnapshot}=await import('../dist/src/lib/proactive-assistant.js');
  const vault=emptyVault();
  vault.savedItems=[{id:'item-1',workspaceId:'default',branchId:'main',createdAt:at('2026-01-01'),updatedAt:at('2026-01-01'),sku:'SKU-1',descriptionEn:'Test Item',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'10',lastCurrency:'USD',lastUnitCost:'8',lastCostCurrency:'USD',usageCount:0,lastUsedAt:'',category:'',tags:[],favorite:false}];
  vault.inventoryMovements=[{id:'mov-1',workspaceId:'default',branchId:'main',itemId:'item-1',itemNameEn:'Test Item',itemNameAr:'',sku:'SKU-1',date:'2026-10-01',type:'opening',quantity:'2',unitCost:'8',currency:'USD',sourceId:'',sourceNumber:'',note:'',createdAt:at('2026-10-01')}];
  const tasks=[task({id:'below',conditionType:'stock-below',conditionValue:'5',relatedEntityType:'product',relatedEntityId:'item-1'}),task({id:'not-below',conditionType:'stock-below',conditionValue:'1',relatedEntityType:'product',relatedEntityId:'item-1'}),task({id:'missing-doc',conditionType:'document-not-converted',conditionValue:'missing-document'})];
  const snapshot=buildProactiveSnapshot(vault,tasks,{at:at('2026-10-04')});
  assert.ok(snapshot.business.signals.some(row=>row.taskId==='below'));
  assert.equal(snapshot.business.signals.some(row=>row.taskId==='not-below'),false);
  assert.equal(snapshot.business.signals.some(row=>row.taskId==='missing-doc'),false,'missing business records must never trigger a guessed condition');
});

test('Proactive category mute is deterministic and does not merge currencies',async()=>{
  const {emptyVault}=await import('../dist/src/lib/defaults.js');
  const {buildProactiveSnapshot}=await import('../dist/src/lib/proactive-assistant.js');
  const vault=emptyVault();
  const rows=[task({id:'a',scope:'personal',title:'Personal A'}),task({id:'b',scope:'business',title:'Business B'})];
  const muted=buildProactiveSnapshot(vault,rows,{at:at('2026-10-04'),mutedCategories:['personal:reminder']});
  assert.equal(muted.personal.signals.length,0);
  assert.ok(muted.business.signals.some(row=>row.taskId==='b'));
  const source=await readFile(new URL('../src/lib/proactive-assistant.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/convertedTotal|combinedCurrency|grandTotalAcrossCurrencies/i);
});

test('Batch 7 voice extends the existing recognizer lifecycle instead of replacing it',async()=>{
  const installer=await readFile(new URL('../scripts/ai-batch7-proactive-voice.mjs',import.meta.url),'utf8');
  assert.match(installer,/normalizeVoiceTranscript/);
  assert.match(installer,/[٠-٩]/);
  assert.match(installer,/[۰-۹]/);
  assert.match(installer,/Transcript ready — edit or send/);
  assert.match(installer,/lourex-ai-voice-retry/);
  assert.match(installer,/toggleVoice\(panel\)/);
  assert.match(installer,/node --check|--check/);
  assert.doesNotMatch(installer,/requestSubmit\(\)|\.submit\(\)/,'voice must populate an editable composer and never auto-submit');
});

test('Batch 7 proactive controls reuse existing deterministic state and add no serverless function',async()=>{
  const [component,engine,pkg]=await Promise.all([
    readFile(new URL('../src/components/ProactiveAssistantTool.tsx',import.meta.url),'utf8'),
    readFile(new URL('../src/lib/proactive-assistant.ts',import.meta.url),'utf8'),
    readFile(new URL('../package.json',import.meta.url),'utf8')
  ]);
  assert.match(component,/validatedNotificationStateEvent/);
  assert.match(component,/snoozeAssistantTask/);
  assert.match(component,/completeAssistantTask/);
  assert.match(component,/Mute category/);
  assert.match(component,/Business and Personal scopes stay separate/);
  assert.match(engine,/buildNotificationCenter/);
  assert.match(engine,/whatMattersToday/);
  assert.match(engine,/conditionSatisfied/);
  assert.match(pkg,/ai-batch6-personal-memory-tasks\.mjs && node scripts\/ai-batch7-proactive-voice\.mjs/);
  const apiFiles=(await readdir(new URL('../api/',import.meta.url))).filter(name=>name.endsWith('.js')&&!name.startsWith('_'));
  assert.ok(apiFiles.length<=12,`Vercel Hobby supports at most 12 top-level Serverless Functions; found ${apiFiles.length}`);
});
