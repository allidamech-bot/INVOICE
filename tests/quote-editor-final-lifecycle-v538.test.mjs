import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const runner=read('tests/visual/run-v538-quote-editor-final-flow.cjs');
const fixture=read('tests/visual/v538-quote-editor-final-flow.html');
const workflow=read('scripts/verify-local.mjs');
const pkg=JSON.parse(read('package.json'));
const departureOwner=read('scripts/v539-editor-departure-single-owner.mjs');
const reviewModal=read('src/components/DocumentReviewModal.tsx');

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

test('v539 emitted quote editor uses one departure persistence owner with synchronous single-flight protection',()=>{
  const build=String(pkg.scripts?.build||'');
  const checkpointAt=build.indexOf('node scripts/v529-document-autosave-checkpoint-fix.mjs');
  const ownerAt=build.indexOf('node scripts/v539-editor-departure-single-owner.mjs');
  const precacheAt=build.indexOf('node scripts/pwa-auto-precache.mjs');
  assert.ok(checkpointAt>=0&&ownerAt>checkpointAt&&precacheAt>ownerAt,'v539 departure owner must finalize the editor runtime after autosave hardening and before PWA precache');
  assert.match(departureOwner,/handleVisibilityChange[\s\S]*this\.flushPendingSnapshot\(\)/);
  assert.match(departureOwner,/flushPendingSnapshot[\s\S]*void this\.save\(true\)/);
  assert.match(departureOwner,/if \(this\.saveInFlight\)/);
  assert.match(departureOwner,/hasNewerChanges && this\.departureFlushQueued/);
  assert.match(departureOwner,/this\.saveInFlight \|\| this\.state\.saving/);
  assert.match(departureOwner,/flushSource\.includes\('this\.props\.onSave\('/);
});

test('v539 review modal escapes the editor stacking context before final PDF confirmation',()=>{
  assert.match(reviewModal,/return <Modal portal open/);
});

test('v538 uses the real EditorPage boundary inside the production #root > .app-ui shell',()=>{
  assert.match(fixture,/<div id="root"><div id="qa-app" class="app-ui"><\/div><\/div>/);
  assert.match(fixture,/import \{EditorPage\} from '\.\/src\/components\/EditorPage\.js'/);
  assert.match(fixture,/ReactDOM\.render\(React\.createElement\(EditorPage,props\),document\.getElementById\('qa-app'\)\)/);
  assert.match(fixture,/__LOUREX_PREPARE_PDF__/);
  assert.match(fixture,/className='qa-print-portal print-portal'/);
});

test('v538 lifecycle is enforced by its WebKit workflow',()=>{
  assert.match(workflow,/node --test tests\/quote-editor-final-lifecycle-v538\.test\.mjs/);
  assert.match(workflow,/assertBrowserReady/);
  assert.match(workflow,/webkit/);
  assert.match(workflow,/runBrowserQa\('specialized',MANIFEST\.specialized\)/);
  assert.match(workflow,/node tests\/visual\/run-v538-quote-editor-final-flow\.cjs/);
});
