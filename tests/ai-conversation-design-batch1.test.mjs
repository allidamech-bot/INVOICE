import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('AI conversation design Batch 1 runs after the existing remediation owners',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const build=pkg.scripts.build;
  const remediation=build.indexOf('node scripts/ai-remediation-batch4-tools-routes-ux.mjs');
  const design=build.indexOf('node scripts/ai-conversation-design-batch1.mjs');
  const pdf=build.indexOf('node scripts/v580-safari-pdf-single-page.mjs');
  assert.ok(remediation>=0&&design>remediation&&pdf>design,'design owner must run after AI remediation and before unrelated PDF finalization');
});

test('Batch 1 implements the screenshot-audit hierarchy fixes without changing capabilities',async()=>{
  const source=await read('scripts/ai-conversation-design-batch1.mjs');
  assert.match(source,/width:min\(580px,calc\(100vw - 32px\)\)!important/,'desktop conversation gets a wider readable measure');
  assert.match(source,/\.lourex-ai-title small\{[\s\S]*display:none!important/,'redundant header subtitle is removed');
  assert.match(source,/\.lourex-ai-context-copy\{[\s\S]*display:none!important/,'redundant current-context copy is removed from persistent chrome');
  assert.match(source,/\.lourex-ai-message\{[\s\S]*font-size:15px!important[\s\S]*line-height:1\.62!important/,'message typography is promoted from admin-density sizing');
  assert.match(source,/\.lourex-ai-message\.assistant:before\{[\s\S]*display:none!important/,'repeated LOUREX label is removed from every assistant turn');
  assert.match(source,/\.lourex-ai-answer-copy,[\s\S]*font-size:15px!important/,'structured answers inherit readable conversation sizing');
  assert.match(source,/\.lourex-ai-premium-textarea\{[\s\S]*font-size:16px!important/,'composer is readable on desktop and mobile');
  assert.match(source,/\.lourex-ai-send svg\{[\s\S]*transform:rotate\(90deg\)!important/,'send affordance is an upward arrow instead of back/navigation direction');
  assert.match(source,/\.lourex-ai-meta>span\{[\s\S]*display:none!important/,'technical deterministic metadata no longer competes with the composer');
  assert.match(source,/@media \(hover:hover\) and \(pointer:fine\)[\s\S]*\.lourex-ai-message-actions\{[\s\S]*opacity:0!important/,'desktop secondary message actions use progressive disclosure');
  assert.match(source,/html body #root \.lourex-ai-backdrop\{[\s\S]*display:none!important/,'desktop remains context-visible behind the advisor');
  assert.doesNotMatch(source,/assistantCapabilityAllowed|document\.createDraft|payment\.record|inventory\.adjust/,'presentation batch must not change AI authority or business actions');
});

test('Batch 1 preserves mobile touch and full conversation readability',async()=>{
  const source=await read('scripts/ai-conversation-design-batch1.mjs');
  assert.match(source,/@media\(max-width:720px\)/);
  assert.match(source,/\.lourex-ai-scope-button\{[\s\S]*min-height:44px!important/);
  assert.match(source,/\.lourex-ai-message\{[\s\S]*font-size:15\.5px!important/);
  assert.match(source,/\.lourex-ai-compose\{[\s\S]*env\(safe-area-inset-bottom,0px\)/);
});
