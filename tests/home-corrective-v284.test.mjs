import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('v284 restores approved LOUREX brand colors and corrective Home layer',()=>{
  const logo=read('public/brand/lourex-logo.svg');
  const css=read('src/styles/home-premium-command-center-v283.css');
  assert.match(logo,/#B8332B/);
  assert.match(logo,/#D7AA52/);
  assert.doesNotMatch(logo,/LOUREX modern fintech brand mark/);
  assert.match(css,/corrective rebuild/);
  assert.match(css,/\.dashboard-kpi em\{display:none!important\}/);
  assert.match(css,/unicode-bidi:isolate/);
  assert.match(css,/\.lourex-advisor-trust\{display:none!important\}/);
});

test('v284 Home assets remain cached in the current v302 PWA generation',()=>{
  const sw=read('public/sw.js');
  assert.match(sw,/const CACHE = 'lourex-invoice-v302'/);
  assert.match(sw,/LOCAL_CORE\.push\('\.\/styles\/home-premium-command-center-v283\.css'\)/);
});

test('v284 Home advisor retains deterministic finance fallback when upstream AI is unavailable',()=>{
  const advisor=read('src/components/LourexAdvisorCard.tsx');
  assert.match(advisor,/buildAiFinanceContext/);
  assert.match(advisor,/localFinanceFallback/);
  assert.match(advisor,/highestOverdueByCurrency/);
  assert.match(advisor,/comparisons\.monthToDateVsPreviousMonth/);
  assert.match(advisor,/monthToDate/);
});
