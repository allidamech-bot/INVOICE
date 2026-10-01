import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

// Compatibility filename retained so PR-diff CI can execute the path. The v475
// review layer is retired; final issue/PDF/share review is now part of v480.
test('v475 review presentation is retired and v480 owns the final decision surface',async()=>{
  const [bridge,editor]=await Promise.all([
    read('src/styles/tailadmin-reliability-bridge-v320.css'),
    read('src/styles/executive-editor-v480.css')
  ]);
  assert.doesNotMatch(bridge,/mobile-review-v475\.css/);
  assert.match(bridge,/executive-editor-v480\.css\?v=480-3/);
  for(const selector of ['.modal:has(.issue-review)','.issue-review-status','.issue-review-grid','.accounting-guardian-review','.modal-footer-actions'])assert.ok(editor.includes(selector),`v480 final review owner is missing ${selector}`);
  assert.match(editor,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(editor,/safe-area-inset-bottom/);
  assert.match(editor,/min-height:44px/);
});

test('v480 final review remains presentation only',async()=>{
  const css=await read('src/styles/executive-editor-v480.css');
  for(const token of ['calculateTotals(','setState(','onSave(','onDelete(','firebase','indexedDB','localStorage','vault.'])assert.ok(!css.includes(token),`review presentation contains forbidden mutation token ${token}`);
});
