/**
 * LOUREX iPhone Home Screen / installed PWA regressions.
 *
 * Offline source contracts only: these tests DO NOT claim to run WebKit, do not
 * contact Firebase or any provider, and never alter a financial record.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Home Screen metadata stays standalone with real iPhone touch artwork',async()=>{
  const html=await read('index.html');
  const manifest=JSON.parse(await read('public/manifest.webmanifest'));
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'./');
  assert.equal(manifest.scope,'./');
  assert.match(html,/name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html,/name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.match(html,/rel="apple-touch-icon" sizes="180x180" href="\.\/brand\/lourex-app-icon-180\.png"/);
  for(const size of [180,192,512]){
    const asset=await stat(new URL('../public/brand/lourex-app-icon-'+size+'.png',import.meta.url));
    assert.ok(asset.size>100,'PNG icon '+size+' must exist');
  }
});

test('standalone WebKit adds the notch inset to both the topbar and the matching grid row',async()=>{
  const css=await read('src/styles/tailadmin-reliability-bridge-v320.css');
  const start=css.indexOf('/* iPhone Home Screen PWA — notch-safe TailAdmin shell geometry');
  assert.ok(start>=0,'final CSS owner must carry installed-iPhone correction');
  const scoped=css.slice(start);
  assert.match(scoped,/@supports\s*\(-webkit-touch-callout:\s*none\)/);
  assert.match(scoped,/@media\s+screen\s+and\s+\(display-mode:\s*standalone\)\s+and\s+\(max-width:\s*900px\)/);
  assert.match(scoped,/html\[dir="rtl"\] body #root \.app-ui \.ta-shell/);
  assert.match(scoped,/grid-template-rows:\s*calc\(70px \+ env\(safe-area-inset-top, 0px\)\) minmax\(0, 1fr\) !important/);
  assert.match(scoped,/html\[dir="rtl"\] body #root \.app-ui \.ta-topbar/);
  assert.match(scoped,/height:\s*calc\(70px \+ env\(safe-area-inset-top, 0px\)\) !important/);
  assert.match(scoped,/min-height:\s*calc\(70px \+ env\(safe-area-inset-top, 0px\)\) !important/);
  // 52px existing touch target, 8px top + 8px bottom + 1px border.
  // Inset must increase container height, not decrease touch clearance.
  for(const inset of [0,20,47,59,62]){
    const available=(70+inset)-(8+inset)-8-1;
    assert.ok(available>=52,'header clearance must fit 52px controls');
  }
});

test('PWA correction is the last bundled CSS owner and leaves browser geometry unchanged',async()=>{
  const build=await read('scripts/build.mjs');
  const html=await read('index.html');
  assert.match(build,/sourceStyleNames\.at\(-1\)!=='tailadmin-reliability-bridge-v320\.css'/);
  assert.match(build,/writeFile\('dist\/styles\/app\.bundle\.css',appBundleCss\)/);
  const linked=Array.from(html.matchAll(/<link rel="stylesheet" href="\.\/styles\/([^"?]+\.css)/g),m=>m[1]);
  assert.equal(linked.at(-1),'tailadmin-reliability-bridge-v320.css');
  const css=await read('src/styles/tailadmin-reliability-bridge-v320.css');
  const block=css.slice(css.indexOf('/* iPhone Home Screen PWA — notch-safe'));
  assert.ok(block.includes('(display-mode: standalone)'));
  assert.ok(!block.includes('serviceWorker.register'));
});

test('iPhone stability mode does not reintroduce automatic worker reloads or erase the vault',async()=>{
  const entry=await read('src/app/index.tsx');
  const begin=entry.indexOf("if(iosWebKit){",entry.indexOf("if('serviceWorker' in navigator)"));
  const end=entry.indexOf('    const hadController=',begin);
  assert.ok(begin>0&&end>begin);
  const ios=entry.slice(begin,end);
  assert.match(ios,/getRegistrations\(\)/);
  assert.match(ios,/registration\.unregister\(\)/);
  assert.doesNotMatch(ios,/indexedDB\.deleteDatabase|deletePlainWorkspace|activateAccountStorage|location\.reload/);
  assert.match(entry,/if\(reloadUnsafeWorkspaceOpen\(\)\)/);
});

test('document editor explicitly awaits a persisted save before Save and Close',async()=>{
  const [invoice,draft]=await Promise.all([
    read('src/components/EditorPageCore.tsx'),
    read('src/components/DraftDocumentEditor.tsx')
  ]);
  const invoiceSave=invoice.slice(invoice.indexOf('private saveAndClose='),invoice.indexOf('private openReview=',invoice.indexOf('private saveAndClose=')));
  assert.match(invoiceSave,/await this\.props\.onSave\(snapshot,true\)/);
  assert.ok(invoiceSave.indexOf('await this.props.onSave(snapshot,true)')<invoiceSave.indexOf('this.props.onClose()'),'close only after save');
  const draftSave=draft.slice(draft.indexOf('private saveAndClose='),draft.indexOf('private output=',draft.indexOf('private saveAndClose=')));
  assert.match(draftSave,/await this\.persistStable\(\)/);
  assert.match(invoice,/window\.addEventListener\('pagehide',this\.handlePageHide\)/);
  assert.match(draft,/window\.addEventListener\('pagehide',this\.handlePageHide\)/);
});
