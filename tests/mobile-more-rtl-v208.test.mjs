import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('current More menu respects explicit RTL, logical-start alignment and mirrored arrows',async()=>{
  const [shell,visual,premium]=await Promise.all([
    read('src/components/AppShell.tsx'),
    read('src/styles/v485-visible-ui-corrections.css'),
    read('src/styles/premium-overlays-v481.css')
  ]);
  assert.match(shell,/className="ta-mobile-sheet" id="ta-mobile-more" role="dialog" aria-modal="true"[\s\S]*?dir=\{this\.props\.language==='ar'\?'rtl':'ltr'\}/);
  assert.match(shell,/className="ta-sheet-link-copy"/);
  assert.match(shell,/className="ta-sheet-chevron"/);
  assert.match(visual,/html\[dir="rtl"\] body #root \.app-ui :is\(\.ta-sheet-chevron,\.ta-customer-profile-back svg\)\{transform:scaleX\(-1\)/,
    'RTL arrows must mirror in the current source owner');
  assert.match(visual,/\.ta-sheet-link,\.ta-create-menu-grid button\)\{text-align:start!important/,
    'logical-start copy alignment must be preserved');
  assert.match(premium,/html\[dir="rtl"\] body #root \.app-ui \.ta-sheet-group>p/,
    'group captions must retain correct RTL typography');
  assert.match(premium,/\.ta-sheet-group/);
  assert.match(visual,/safe-area-inset-bottom/);
});

test('v208 PWA cache forces installed clients to receive the RTL correction',async()=>{
  const patch=await read('scripts/pwa-cache-v205.mjs');
  assert.match(patch,/const CACHE = 'lourex-invoice-v208'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v207'.*legacy marker/);
});
