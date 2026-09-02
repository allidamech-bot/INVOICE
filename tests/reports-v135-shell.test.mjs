import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v135 report shell uses supported icons and keeps five mobile workspaces visible',async()=>{
  const [page,css]=await Promise.all([read('src/components/ReportsPage.tsx'),read('src/styles/reports-v135.css')]);
  assert.ok(page.includes('icon="printer"'));
  assert.ok(!page.includes('name="info"'));
  assert.ok(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))'));
  assert.ok(css.includes('.app-ui .main-nav button'));
});
