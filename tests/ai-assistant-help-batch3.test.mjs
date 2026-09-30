import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Batch 3 keeps one canonical AI assistant and exposes it as a robot',async()=>{
  const ai=await read('src/components/AiCopilot.tsx');
  assert.match(ai,/className=\{`lourex-ai-launcher screen-\$\{this\.props\.screen\}`\}/);
  assert.match(ai,/<Icon name="bot"\/>/);
  assert.match(ai,/every record change requires your approval|كل تغيير على السجلات يحتاج موافقتك/);
  assert.doesNotMatch(ai,/requiresApproval:false,dataMutation:true/);
});

test('Batch 3 mobile discoverability is bilingual, bounded and reduced-motion safe',async()=>{
  const [css,bridge]=await Promise.all([
    read('src/styles/ai-assistant-help-batch3.css'),
    read('src/styles/tailadmin-reliability-bridge-v320.css')
  ]);
  assert.match(bridge,/^@import url\("\.\/mobile-ux-functional-hardening-v363\.css\?v=363-1"\);/);
  assert.match(bridge,/@import url\("\.\/ai-assistant-help-batch3\.css\?v=455-1"\);/);
  assert.match(css,/@media\(max-width:860px\)[\s\S]*Your personal assistant in LOUREX/);
  assert.match(css,/مساعدك الشخصي في LOUREX/);
  assert.match(css,/max-width:min\(210px,calc\(100vw - 82px\)\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*display:none!important/);
  assert.match(css,/lourexAiPulse/);
});

test('Batch 3 Help Center contains the practical usage guide without a new primary route',async()=>{
  const [modal,guide]=await Promise.all([
    read('src/components/ProductInfoModal.tsx'),
    read('src/components/UsageGuide.tsx')
  ]);
  assert.match(modal,/import \{ UsageGuide \} from '\.\/UsageGuide\.js'/);
  assert.match(modal,/<UsageGuide\s*\/>/);
  assert.doesNotMatch(guide,/import .*\.css/);
  for(const section of ['Customer 360','Commercial Flow','Supplier 360','Finance','Reports','LOUREX AI','Backup','Security'])assert.match(guide,new RegExp(section,'i'));
  assert.doesNotMatch(modal,/ProductInfoSection='guide'/);
});

test('Batch 3 browser fixture exercises mobile EN AR desktop and reduced-motion scenarios',async()=>{
  const [runner,fixture]=await Promise.all([
    read('tests/visual/run-ai-assistant-help-batch3.cjs'),
    read('tests/visual/ai-assistant-help-batch3.html')
  ]);
  assert.match(runner,/viewport:\{width,height\}/);
  assert.match(runner,/mobile-en/);
  assert.match(runner,/mobile-ar/);
  assert.match(runner,/desktop-en/);
  assert.match(runner,/mobile-reduced-motion/);
  assert.match(runner,/scrollWidth<=geometry\.innerWidth\+1/);
  assert.match(runner,/width>=44&&geometry\.launcher\.height>=44/);
  assert.match(fixture,/AiCopilot/);
  assert.match(fixture,/UsageGuide/);
});
