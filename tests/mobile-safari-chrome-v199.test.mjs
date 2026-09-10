import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const activeCacheVersion=sw=>{
  const matches=[...sw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)];
  return matches.length?Number(matches.at(-1)[1]):0;
};

test('v199 loads after v198 and before the printable document layer',async()=>{
  const html=await read('index.html');
  const v198='mobile-spacing-fit-v198.css';
  const v199='mobile-safari-chrome-v199.css';
  const printable='document-premium-redesign-v141.css';
  assert.ok(html.includes(`./styles/${v199}`),'v199 stylesheet must be linked');
  assert.ok(html.indexOf(v199)>html.indexOf(v198),'v199 must override the v198 physical viewport layer');
  assert.ok(html.indexOf(printable)>html.indexOf(v199),'printable document CSS must remain final');
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
