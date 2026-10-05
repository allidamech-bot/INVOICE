import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const presentation=read('src/lib/ai-presentation.ts');
const brief=read('src/components/DailyCommandCenterTool.tsx');
const proactive=read('src/components/ProactiveAssistantTool.tsx');
const owner=read('scripts/ai-remediation-batch4-tools-ux.mjs');

test('Batch 4 presentation owner runs after conversation UX and before final voice hash',()=>{
  const build=String(pkg.scripts?.build||'');
  const batch3=build.indexOf('node scripts/ai-remediation-batch3-conversation-ux-closeout.mjs');
  const batch4=build.indexOf('node scripts/ai-remediation-batch4-tools-ux.mjs');
  const voice=build.indexOf('node scripts/ai-voice-final-runtime-hash.mjs');
  assert.ok(batch3>=0&&batch4>batch3&&voice>batch4,'Batch 4 tools UX must not disturb the final voice owner ordering');
});

test('raw product field names have explicit human English and Arabic labels',()=>{
  for(const token of ["sku:['SKU','رمز المنتج']","hsCode:['HS Code','الرمز الجمركي']","cost:['Cost','التكلفة']","descriptionAr:['Arabic description','الوصف العربي']"])assert.ok(presentation.includes(token),`missing human label mapping: ${token}`);
  assert.match(presentation,/humanizeMissingFieldDetail/);
});

test('Morning Brief is an executive summary and does not render technical evidence keys',()=>{
  for(const token of ["t('Priority','الأولوية')","t('Issue','المسألة')","t('Impact','الأثر')","t('Action','الإجراء')",'aiPriorityLabel(signal.category,lang)','aiKindLabel(signal.kind,lang)','aiSignalDetail(raw,signal.kind,lang)'])assert.ok(brief.includes(token),`missing executive presentation contract: ${token}`);
  assert.doesNotMatch(brief,/signal\.evidence\.join/,'technical evidence keys must not be user-visible in Morning Brief');
  assert.doesNotMatch(brief,/categoryLabel\(signal\.category\)\s*}\s*·\s*{signal\.kind/,'raw signal kind must not be printed');
  assert.match(proactive,/aiSignalDetail\(/,'proactive assistant dock must use the same public detail formatter');
});

test('Memory & Tasks replaces raw enums and ISO placeholder at final runtime boundary',()=>{
  assert.match(owner,/__lourexPublicManagerLabel/);
  assert.match(owner,/__lourexPublicDue/);
  assert.match(owner,/__lxEl\('small',null,__lourexPublicManagerLabel\(row\.kind,'memory'\)\)/);
  assert.match(owner,/__lourexPublicManagerLabel\(row\.recurrence,'recurrence'\)/);
  assert.match(owner,/__lourexPublicManagerLabel\(row\.status,'status'\)/);
  assert.match(owner,/Due date \/ time/);
});

test('Batch 4 flattens tools, Morning Brief and manager surfaces without removing functions',()=>{
  for(const token of ['lourex-executive-signal-grid','lourex-ai-workflow-section .ai-workflow-actions','LOUREX Remediation Batch 4 — Memory & Tasks UX','safe-area-inset-bottom'])assert.ok(owner.includes(token),`missing UX contract: ${token}`);
  assert.match(owner,/__lourexExecutiveToolsBatch4/,'existing AI Tools runtime remains the prerequisite');
  assert.match(owner,/__lourexPersonalMemoryTasksBatch6/,'existing Memory & Tasks runtime remains the prerequisite');
});
