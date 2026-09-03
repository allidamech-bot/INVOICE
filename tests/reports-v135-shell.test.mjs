import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v152 report shell uses supported icons without overriding shared mobile navigation',async()=>{
  const [page,css,recoveryCss]=await Promise.all([read('src/components/ReportsPage.tsx'),read('src/styles/reports-v135.css'),read('src/styles/ux-recovery-v152.css')]);
  assert.ok(page.includes('icon="printer"'));
  assert.ok(!page.includes('name="info"'));
  assert.ok(!css.includes('.app-ui .main-nav'));
  assert.ok(recoveryCss.includes('.app-ui .main-nav button'));
  assert.ok(recoveryCss.includes('grid-template-columns:repeat(6,minmax(0,1fr))!important'));
});
