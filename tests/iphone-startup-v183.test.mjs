import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

/* Historical filename retained for stable discovery. v351 replaces the old
   forced-dark startup generation with one palette-aware launch surface. */

test('v351 iPhone startup keeps one static boot owner and one canonical palette through finalization',async()=>{
  const [html,app,bootstrap,theme,startupCss,manifestText,finalizer]=await Promise.all([
    read('index.html'),
    read('src/app/App.tsx'),
    read('public/theme-bootstrap-v347.js'),
    read('src/lib/ui-theme.ts'),
    read('src/styles/v347-startup-single-layer.css'),
    read('public/manifest.webmanifest'),
    read('scripts/v347-startup-finalize.mjs')
  ]);
  const manifest=JSON.parse(manifestText);
  const boot=html.indexOf('id="lourex-boot"');
  const react=html.indexOf('react.production.min.js');
  const themeBootstrap=html.indexOf('src="./theme-bootstrap-v347.js?v=351"');

  assert.ok(boot>=0&&react>boot,'boot shell must be present before runtime scripts');
  assert.ok(themeBootstrap>=0&&themeBootstrap<boot,'external source bootstrap must resolve the preference before the boot shell paints');
  assert.doesNotMatch(html,/id="lourex-theme-bootstrap"/);
  assert.match(html,/<meta name="theme-color" content="#081321" \/>/);
  assert.match(html,/html\[data-ui-theme="light"\]\{--boot-bg:#f4f7fb/);
  assert.match(html,/html\[data-ui-theme="dark"\]\{--boot-bg:#081321/);
  assert.match(html,/id="lourex-boot" class="loading-screen"/);
  assert.match(html,/class="brand official-brand"/);
  assert.match(html,/class="brand-mark"><img src="\.\/brand\/lourex-logo\.svg" alt="LOUREX"/);
  assert.match(html,/class="loading-line"/);
  assert.match(bootstrap,/dark='#081321',light='#f4f7fb'/);
  assert.match(theme,/THEME_COLORS:Record<ResolvedUiTheme,string>=\{light:'#f4f7fb',dark:'#081321'\}/);
  assert.doesNotMatch(theme,/#080808|#061820|#f2f7f8/);
  assert.match(startupCss,/background:var\(--boot-bg,var\(--ft-canvas,#081321\)\)!important/);
  assert.equal(manifest.background_color,'#081321');
  assert.equal(manifest.theme_color,'#081321');
  assert.match(finalizer,/theme-bootstrap-v347\.js\?v=351/);
  assert.match(finalizer,/canonicalLightBoot/);
  assert.match(finalizer,/canonicalDarkBoot/);
  assert.match(finalizer,/document-entry-v302\.js\?v=351/);
  assert.match(finalizer,/storage-cleanup-v347\.js\?v=351/);
  assert.match(app,/if\(this\.state\.loading\)return <div className="loading-screen"><Brand logoDataUrl=\{this\.state\.publicLogo\} language=\{activeLanguage\}\/><span className="loading-line"\/><\/div>/);
});

test('cloud bootstrap uses an already-restored Firebase user before the slower auth wait',async()=>{
  const startup=await read('src/cloud/startup.ts');
  assert.match(startup,/currentCloudUser/);
  const ready=startup.indexOf('let user=currentCloudUser()');
  const wait=startup.indexOf('await waitForCloudUser()');
  const reconcile=startup.indexOf('await reconcileCloudVault(user.uid)');
  assert.ok(ready>=0&&wait>ready&&reconcile>wait);
});

test('startup remains bounded and never performs an automatic watchdog reload',async()=>{
  const [entry,watchdog]=await Promise.all([read('src/app/index.tsx'),read('public/startup-watchdog-v321.js')]);
  const hydrate=entry.indexOf('await hydrateAuthoritativeCloudBeforeApp()');
  const render=entry.indexOf('ReactDOM.render');
  assert.ok(hydrate>=0&&render>hydrate);
  assert.match(watchdog,/automaticReload=no/);
  assert.match(watchdog,/startup-recovery-user-retry/);
  assert.doesNotMatch(watchdog,/setTimeout\(\(\)=>window\.location\.reload\(\)/);
});
