import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('historical v123 card-containment workaround is retired from the live cascade',async()=>{
  const [legacy,current,html]=await Promise.all([
    read('src/styles/mobile-document-actions-v123.css'),
    read('src/styles/mobile-document-actions-v125.css'),
    read('index.html')
  ]);
  // Keep the historical source available during cleanup so the regression it
  // documented remains auditable, but do not execute that card-scoped fix.
  assert.match(legacy,/content-visibility:visible!important/);
  assert.match(legacy,/contain:none!important/);
  assert.doesNotMatch(html,/mobile-document-actions-v123\.css/);
  assert.match(html,/mobile-document-actions-v125\.css/);
  assert.match(current,/\.mobile-document-action-portal[\s\S]*?position:fixed!important/);
  assert.match(current,/bottom:max\([^)]*safe-area-inset-bottom/);
  assert.doesNotMatch(current,/content-visibility:visible!important/);
  assert.doesNotMatch(current,/contain:none!important/);
});
