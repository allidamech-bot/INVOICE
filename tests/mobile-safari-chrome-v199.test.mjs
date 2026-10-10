import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const activeCacheVersion=sw=>{
  const matches=[...sw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)];
  return matches.length?Number(matches.at(-1)[1]):0;
};

test('current TailAdmin mobile shell owns Safari/PWA safe-area geometry without retired v199 CSS',async()=>{
 const [html,css,bridge]=await Promise.all([read('index.html'),read('src/styles/tailadmin-shell-v320.css'),read('src/styles/tailadmin-reliability-bridge-v320.css')]);
 assert.equal(html.includes('mobile-safari-chrome-v199.css'),false);
 assert.ok(html.includes('tailadmin-shell-v320.css'));
 assert.ok(html.includes('tailadmin-reliability-bridge-v320.css'));
 assert.ok(css.includes('.ta-mobile-nav')&&css.includes('.ta-mobile-sheet'));
 assert.ok(css.includes('env(safe-area-inset-bottom'));
 assert.ok(bridge.includes('safe-area-inset-bottom')||bridge.includes('min-height:44px'));
 assert.ok(html.includes('document-premium-redesign-v141.css'),'A4 styling remains independent');
});

test('v199 separates Safari browser chrome from standalone PWA safe areas',async()=>{
  const css=await read('src/styles/mobile-safari-chrome-v199.css');
  for(const marker of [
    '--device-safe-top:env(safe-area-inset-top,0px)',
    '--device-safe-bottom:env(safe-area-inset-bottom,0px)',
    '--app-safe-top:0px',
    '--app-safe-bottom:0px',
    '@media (display-mode:standalone)',
    '--app-safe-top:var(--device-safe-top)',
    '--app-safe-bottom:var(--device-safe-bottom)'
  ])assert.ok(css.includes(marker),marker);
  assert.match(css,/\.workspace-topbar,[\s\S]*min-height:calc\(58px \+ var\(--app-safe-top\)\)!important/);
  assert.match(css,/\.mobile-bottom-nav\{[\s\S]*height:calc\(66px \+ var\(--app-safe-bottom\)\)!important[\s\S]*padding-bottom:var\(--app-safe-bottom\)!important/);
  assert.match(css,/\.workspace-shell:not\(\.is-editor\) \.workspace-content\{[\s\S]*padding-bottom:calc\(78px \+ var\(--app-safe-bottom\)\)!important/);
  assert.match(css,/\.auth-account-page\{[\s\S]*padding-top:max\(10px,var\(--app-safe-top\)\)!important[\s\S]*padding-bottom:max\(12px,var\(--app-safe-bottom\)\)!important/);
});

test('v199 keeps the launch state compact inside the dynamic visual viewport',async()=>{
  const css=await read('src/styles/mobile-safari-chrome-v199.css');
  assert.match(css,/\.loading-screen\{[\s\S]*height:100dvh!important;[\s\S]*min-height:100dvh!important/);
  assert.match(css,/\.loading-screen \.brand,[\s\S]*\.loading-screen \.loading-line\{[\s\S]*flex:0 0 auto!important;[\s\S]*margin:0!important/);
});

test('v199 is shipped as an immutable PWA generation and cached offline',async()=>{
  const sw=await read('public/sw.js');
  assert.ok(activeCacheVersion(sw)>=199,'active PWA generation must be v199 or newer');
  assert.match(sw,/lourex-invoice-v198: preserved as a legacy marker/);
  assert.ok(sw.includes("LOCAL_CORE.push('./styles/mobile-safari-chrome-v199.css');"),'v199 CSS must be cached for installed/offline clients');
});
