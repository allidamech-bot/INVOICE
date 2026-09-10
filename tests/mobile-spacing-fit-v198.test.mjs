import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v198 is the final screen-only mobile fit layer before the printable document layer',async()=>{
  const [html,css]=await Promise.all([read('index.html'),read('src/styles/mobile-spacing-fit-v198.css')]);
  const mobileLayer='mobile-spacing-fit-v198.css';
  const documentLayer='document-premium-redesign-v141.css';
  assert.ok(html.includes(`./styles/${mobileLayer}`),'v198 mobile fit stylesheet must be loaded');
  assert.ok(html.indexOf(mobileLayer)>html.indexOf('obsidian-mobile-geometry-v193.css'),'v198 must follow earlier mobile geometry layers');
  assert.ok(html.indexOf(documentLayer)>html.indexOf(mobileLayer),'printable v141 document layer must remain final');
  const styleNames=[...html.matchAll(/<link rel="stylesheet" href="\.\/styles\/([^\"]+\.css)" \/>/g)].map(match=>match[1]);
  assert.equal(styleNames.at(-1),documentLayer);
  assert.match(css,/@media screen and \(max-width:960px\)/);
  assert.doesNotMatch(css,/\.invoice-page|\.template-(executive|minimal|trade|signature|obsidian|cobalt|editorial|split|prism|slate|horizon|mono|aurora|ledger|noir|midnight|blackivory|carbon)/);
});

test('v198 removes light root seams and uses dynamic mobile viewport geometry',async()=>{
  const css=await read('src/styles/mobile-spacing-fit-v198.css');
  assert.match(css,/html,\s*\n\s*body,\s*\n\s*#root\{[\s\S]*overflow-x:clip;[\s\S]*background:#091218/);
  assert.match(css,/body\{[\s\S]*min-height:100vh;[\s\S]*min-height:100svh;[\s\S]*min-height:100dvh/);
  assert.match(css,/html:has\(\.auth-account-page\),[\s\S]*body:has\(\.auth-account-page\),[\s\S]*#root:has\(\.auth-account-page\)\{[\s\S]*background:#05121b!important/);
  assert.match(css,/\.auth-account-page\{[\s\S]*min-height:100svh!important;[\s\S]*min-height:100dvh!important;[\s\S]*overflow-x:clip!important/);
  assert.match(css,/overscroll-behavior-y:none/);
});

test('v198 keeps phone gutters, bottom navigation clearance and narrow forms inside the physical viewport',async()=>{
  const css=await read('src/styles/mobile-spacing-fit-v198.css');
  assert.match(css,/--phone-gutter-start:max\(12px,env\(safe-area-inset-left\)\)/);
  assert.match(css,/--phone-gutter-end:max\(12px,env\(safe-area-inset-right\)\)/);
  assert.match(css,/--phone-bottom-clearance:calc\(78px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css,/\.app-ui \.workspace-topbar\{[\s\S]*max-width:100vw!important/);
  assert.match(css,/\.app-ui \.mobile-bottom-nav\{[\s\S]*width:100%!important;[\s\S]*max-width:100vw!important/);
  assert.match(css,/\.workspace-shell:not\(\.is-editor\) \.workspace-content\{[\s\S]*padding-bottom:var\(--phone-bottom-clearance\)!important/);
  assert.match(css,/@media screen and \(max-width:380px\)[\s\S]*\.form-grid\.two[\s\S]*grid-template-columns:minmax\(0,1fr\)!important/);
});

test('v198 compacts only redundant account-entry story content on short phones',async()=>{
  const css=await read('src/styles/mobile-spacing-fit-v198.css');
  assert.match(css,/@media screen and \(max-width:600px\) and \(max-height:700px\)/);
  assert.match(css,/\.auth-account-story\{[\s\S]*min-height:0!important/);
  assert.match(css,/\.auth-story-copy>p:last-child,[\s\S]*\.auth-story-kicker\{[\s\S]*display:none!important/);
  assert.match(css,/\.auth-story-copy h2\{[\s\S]*font-size:clamp\(25px,8\.5vw,31px\)!important/);
});

test('v198 aligns boot, manifest and installed PWA cache with the dark mobile canvas',async()=>{
  const [html,manifestText,sw]=await Promise.all([read('index.html'),read('public/manifest.webmanifest'),read('public/sw.js')]);
  const manifest=JSON.parse(manifestText);
  assert.match(html,/<meta name="theme-color" content="#071a25" \/>/);
  assert.match(html,/html,body,#root\{min-height:100%;min-height:100dvh;margin:0;background:#071a25\}/);
  assert.equal(manifest.background_color,'#071a25');
  assert.equal(manifest.theme_color,'#071a25');
  assert.match(sw,/const CACHE = 'lourex-invoice-v198';/);
  assert.match(sw,/lourex-invoice-v197: preserved as a legacy marker/);
  assert.ok(sw.includes("LOCAL_CORE.push('./styles/mobile-spacing-fit-v198.css');"),'v198 stylesheet must be available to installed/offline clients');
});
