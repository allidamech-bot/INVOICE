import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('current performant UI honors reduced motion and ships one offline stylesheet',async()=>{
 const [html,sw,bundle,legacy]=await Promise.all([read('index.html'),read('dist/sw.js'),read('dist/styles/app.bundle.css'),read('src/styles/premium-smoothness-v99.css')]);
 assert.ok(html.includes('performance-polish-v100.css'));
 assert.ok(html.includes('tailadmin-shell-v320.css'));
 assert.ok(bundle.includes('performance-polish-v100.css'));
 assert.ok(sw.includes('styles/app.bundle.css'));
 assert.equal(html.includes('premium-smoothness-v99.css'),false,'retired visual layer is no longer a separate cascade owner');
 assert.ok(legacy.includes('prefers-reduced-motion'),'motion accessibility is preserved in historical assets');
});

test('v99 uses compositor-friendly restrained motion and touch momentum',async()=>{
  const css=await read('src/styles/premium-smoothness-v99.css');
  assert.match(css,/--motion-ui:170ms/);
  assert.match(css,/touch-action:manipulation/);
  assert.match(css,/-webkit-overflow-scrolling:touch/);
  assert.match(css,/transition:[\s\S]*?transform[\s\S]*?opacity/);
  assert.doesNotMatch(css,/transition\s*:\s*all/i);
});

test('v99 respects reduced motion and keeps printable document selectors untouched',async()=>{
  const css=await read('src/styles/premium-smoothness-v99.css');
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css,/transition-duration:\.001ms!important/);
  assert.doesNotMatch(css,/\.invoice-page\s*\{/);
  assert.doesNotMatch(css,/\.items-table\s*\{/);
  assert.doesNotMatch(css,/\.doc-body\s*\{/);
});
