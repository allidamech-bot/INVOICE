import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v99 smoothness layer loads last and is available offline',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const styles=[...html.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].map(match=>match[1]);
  assert.equal(styles.at(-1),'premium-smoothness-v99.css');
  assert.match(sw,/const CACHE = 'lourex-invoice-v99'/);
  assert.match(sw,/\.\/styles\/premium-smoothness-v99\.css/);
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
