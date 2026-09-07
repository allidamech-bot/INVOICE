import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('iPhone startup paints the same launch screen React uses before runtime scripts execute',async()=>{
  const [html,app,css]=await Promise.all([read('index.html'),read('src/app/App.tsx'),read('src/styles/auth-entry.css')]);
  const boot=html.indexOf('id="lourex-boot"');
  const react=html.indexOf('react.production.min.js');
  assert.ok(boot>=0&&react>boot,'boot shell must be present before runtime scripts');
  assert.match(html,/id="lourex-boot" class="loading-screen"/);
  assert.match(html,/class="brand official-brand"/);
  assert.match(html,/class="brand-mark"><img src="\.\/brand\/lourex-logo\.svg" alt="LOUREX"/);
  assert.match(html,/class="brand-words"><strong>LOUREX<\/strong>/);
  assert.match(html,/class="loading-line"/);
  assert.match(html,/linear-gradient\(145deg,#071522 0%,#0a1c2a 52%,#10283a 100%\)/);
  assert.match(html,/prefers-reduced-motion:reduce/);
  assert.match(app,/if\(this\.state\.loading\)return <div className="loading-screen"><Brand logoDataUrl=\{this\.state\.publicLogo\} language=\{activeLanguage\}\/><span className="loading-line"\/><\/div>/);
  assert.match(css,/\.loading-screen\{[\s\S]*linear-gradient\(145deg,#071522 0%,#0a1c2a 52%,#10283a 100%\)/);
});

test('cloud bootstrap uses an already-restored Firebase user before the slower auth wait',async()=>{
  const startup=await read('src/cloud/startup.ts');
  assert.match(startup,/currentCloudUser/);
  const ready=startup.indexOf('let user=currentCloudUser()');
  const wait=startup.indexOf('await waitForCloudUser()');
  const reconcile=startup.indexOf('await reconcileCloudVault(user.uid)');
  assert.ok(ready>=0&&wait>ready&&reconcile>wait);
});

test('startup still resolves its bounded cloud preflight before React renders',async()=>{
  const entry=await read('src/app/index.tsx');
  const hydrate=entry.indexOf('await hydrateAuthoritativeCloudBeforeApp()');
  const render=entry.indexOf('ReactDOM.render');
  assert.ok(hydrate>=0&&render>hydrate);
});

test('v185 recaches the unified launch shell while preserving v184 recovery history',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/^const CACHE = 'lourex-invoice-v185';$/m);
  assert.match(sw,/lourex-invoice-v184: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v183: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v182: preserved as a legacy marker/);
  assert.ok(sw.includes('./index.html'));
  assert.ok(sw.includes('./src/app/App.js'));
});
