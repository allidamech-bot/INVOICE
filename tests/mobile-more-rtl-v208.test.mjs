import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('current mobile More sheet preserves Arabic RTL, logical alignment and accessibility',async()=>{
 const [shell,css,reliability]=await Promise.all([read('src/components/AppShell.tsx'),read('src/styles/tailadmin-shell-v320.css'),read('src/styles/tailadmin-reliability-bridge-v320.css')]);
 for(const token of ['className="ta-mobile-sheet"','id="ta-mobile-more"','role="dialog"','aria-modal="true"',"dir={this.props.language==='ar'?'rtl':'ltr'}",'ta-sheet-header','ta-sheet-link-copy','ta-sheet-group'])assert.ok(shell.includes(token),token);
 assert.ok(css.includes('[dir="rtl"] .app-ui .ta-sheet-chevron'),'chevron direction follows RTL');
 assert.ok(css.includes('.ta-sheet-group>p'),'logical group heading owner');
 assert.ok(css.includes('inset-inline'),'sheet uses logical horizontal positions');
 assert.ok(reliability.includes('focus-visible'),'keyboard visibility is preserved');
 assert.ok(reliability.includes('min-height:44px'),'touch controls remain accessible');
});

test('v208 PWA cache forces installed clients to receive the RTL correction',async()=>{
  const patch=await read('scripts/pwa-cache-v205.mjs');
  assert.match(patch,/const CACHE = 'lourex-invoice-v208'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v207'.*legacy marker/);
});
