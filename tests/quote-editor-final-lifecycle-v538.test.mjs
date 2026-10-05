import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const runner=read('tests/visual/run-v538-quote-editor-final-flow.cjs');
const fixture=read('tests/visual/v538-quote-editor-final-flow.html');
const workflow=read('.github/workflows/quote-editor-final-lifecycle.yml');

test('v538 final quote lifecycle covers priority iPhone and iPad WebKit sizes',()=>{
  assert.match(runner,/const \{webkit\}=require\('playwright'\)/);
  assert.match(runner,/iphone-390x844/);
  assert.match(runner,/ipad-820x1180/);
  assert.match(runner,/ipad-1024x1366/);
  assert.match(runner,/iPhone OS 18_0/);
  assert.match(runner,/iPad; CPU OS 18_0/);
});

test('v538 follows one integrated edit, autosave, hide, return, PDF and editor-continuity journey',()=>{
  assert.match(runner,/sustained edits produced/);
  assert.match(runner,/visibilitychange/);
  assert.match(runner,/pagehide/);
  assert.match(runner,/pageshow/);
  assert.match(runner,/post-return edit/);
  assert.match(runner,/Confirm, Issue & PDF\|Continue to PDF/);
  assert.match(runner,/PDF output closed the editor/);
  assert.match(runner,/PDF output navigated away from the editor/);
  assert.match(runner,/final-lock-banner/);
  assert.match(runner,/printEvents\[0\]\?\.number,'PI-2026-0538-E'/);
  assert.match(runner,/printEvents\[0\]\?\.status,'final'/);
});

test('v538 rejects duplicate or parallel editor persistence across autosave and app hide',()=>{
  assert.match(runner,/saveAttempts,1/);
  assert.match(runner,/saveAttempts,2/);
  assert.match(runner,/saveAttempts,3/);
  assert.match(runner,/saveAttempts,4/);
  assert.match(runner,/maxConcurrent,1/);
  assert.match(runner,/app hide\/pagehide produced duplicate saves/);
  assert.match(runner,/app hide\/pagehide produced parallel saves/);
  assert.match(fixture,/window\.activeSaves\+=1/);
  assert.match(fixture,/window\.maxConcurrentSaves=Math\.max/);
});

test('v538 uses the real EditorPage boundary and is enforced by its WebKit workflow',()=>{
  assert.match(fixture,/import \{EditorPage\} from '\.\/src\/components\/EditorPage\.js'/);
  assert.match(fixture,/ReactDOM\.render\(React\.createElement\(EditorPage,props\)/);
  assert.match(fixture,/__LOUREX_PREPARE_PDF__/);
  assert.match(fixture,/className='qa-print-portal print-portal'/);
  assert.match(workflow,/node --test tests\/quote-editor-final-lifecycle-v538\.test\.mjs/);
  assert.match(workflow,/npx playwright install --with-deps webkit/);
  assert.match(workflow,/node tests\/visual\/run-v538-quote-editor-final-flow\.cjs/);
});
