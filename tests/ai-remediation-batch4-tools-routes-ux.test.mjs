import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Batch 4 presentation owner runs after Batch 3 and before final voice hash',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const build=pkg.scripts.build;
  const batch3=build.indexOf('node scripts/ai-remediation-batch3-conversation-ux-closeout.mjs');
  const batch4=build.indexOf('node scripts/ai-remediation-batch4-tools-routes-ux.mjs');
  const voiceHash=build.indexOf('node scripts/ai-voice-final-runtime-hash.mjs');
  assert.ok(batch3>=0&&batch4>batch3&&voiceHash>batch4,'Batch 4 must be a final presentation owner without superseding the voice finalizer');
});

test('Batch 4 is presentation-only and humanizes technical labels',async()=>{
  const owner=await read('scripts/ai-remediation-batch4-tools-routes-ux.mjs');
  for(const token of ['__lourexRemediationMemoryKind','__lourexRemediationTaskMeta','lourex-ai-hub-action-copy',"supplier_purchase:['Supplier purchase','شراء من مورد']",'humanizeTechnicalMeta','dataset.lourexBatch4'])assert.match(owner,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const forbidden of ['requestAiJson(','mutateVaultSafely(','createAssistantMemory(','updateAssistantTask(','deleteAssistantTask(','fetch('])assert.doesNotMatch(owner,new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`presentation owner must not introduce ${forbidden}`);
  assert.match(owner,/appCss\+=appCssBlock/);
  assert.match(owner,/composerCss\+=composerCssBlock/);
});

test('Morning Brief exposes decision hierarchy without raw evidence or signal kinds',async()=>{
  const source=await read('src/components/DailyCommandCenterTool.tsx');
  for(const token of ["t('Priority','الأولوية')","t('Issue','الموضوع')","t('Impact','الأثر')","t('Action','الإجراء')",'lourex-brief-priority','lourex-brief-field is-action','taskMeta(task)'])assert.match(source,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(source,/className="lourex-proactive-evidence"/,'raw evidence must not be rendered in the user-facing Morning Brief');
  assert.doesNotMatch(source,/\{signal\.kind\}/,'raw signal kind must not be rendered to users');
});

test('Batch 4 closeout maps product-data fields to human labels at user-facing boundaries',async()=>{
  const presentation=await read('src/lib/ai-presentation.ts');
  const brief=await read('src/components/DailyCommandCenterTool.tsx');
  const proactive=await read('src/components/ProactiveAssistantTool.tsx');
  for(const token of ["sku:['SKU','رمز المنتج']","hsCode:['HS Code','الرمز الجمركي']","cost:['Cost','التكلفة']","descriptionAr:['Arabic description','الوصف العربي']","'product-data':['Product data','بيانات المنتج']",'humanizeMissingFieldDetail'])assert.match(presentation,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(brief,/aiSignalDetail\(raw,signal\.kind,lang\)/,'Morning Brief must humanize product-data details before rendering');
  assert.match(proactive,/aiSignalDetail\(lang==='ar'\?top\.detailAr:top\.detail,top\.kind,lang\)/,'Proactive assistant must humanize the same detail consistently');
});

test('Tools hub preserves exact accessible action names after adding descriptions',async()=>{
  const placement=await read('scripts/ai-batch7-placement-repair.mjs');
  assert.match(placement,/button\.setAttribute\('aria-label',label\)/);
  assert.match(placement,/action\(text\.inbox/);
  assert.match(placement,/action\(text\.memory/);
  assert.match(placement,/action\(text\.brief/);
});
