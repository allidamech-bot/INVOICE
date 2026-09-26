import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

/* Historical filename retained for stable discovery. The pre-TailAdmin v198 mobile
   spacing generation is retired; v351 protects the current mobile owner split. */

test('v351 source stack no longer loads the retired v198 mobile spacing generation',async()=>{
  const [html,build]=await Promise.all([read('index.html'),read('scripts/build.mjs')]);
  assert.doesNotMatch(html,/mobile-spacing-fit-v198\.css/);
  assert.match(html,/tailadmin-mobile-header-v322\.css/);
  assert.match(html,/tailadmin-design-mobile-priority-v323\.css/);
  assert.match(html,/mobile-controls-density-v177\.css/);
  assert.match(html,/v331-draft-scroll-recovery\.css/);
  assert.match(build,/app\.bundle\.css/);
  assert.match(build,/standaloneRuntimeStyles/);
});

test('v351 mobile spacing has one page clearance owner and one universal 44px touch floor',async()=>{
  const [mobile,controls,shell]=await Promise.all([
    read('src/styles/tailadmin-design-mobile-priority-v323.css'),
    read('src/styles/mobile-controls-density-v177.css'),
    read('src/styles/tailadmin-mobile-header-v322.css')
  ]);
  assert.match(mobile,/padding:18px 14px calc\(112px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
  assert.match(controls,/@media \(max-width:960px\) and \(pointer:coarse\)/);
  assert.match(controls,/min-height:44px!important/);
  assert.match(shell,/scroll-padding-bottom:calc\(116px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
});

test('v351 Safari document scrolling is owned by ta-main instead of nested mobile editor scrollers',async()=>{
  const recovery=await read('src/styles/v331-draft-scroll-recovery.css');
  assert.match(recovery,/\.ta-shell\.is-editor>\.ta-main/);
  assert.match(recovery,/overflow-y:auto!important/);
  assert.match(recovery,/touch-action:pan-y!important/);
  assert.match(recovery,/\.editor-scroll\{[\s\S]*-webkit-overflow-scrolling:auto!important/);
  assert.match(recovery,/\.draft-studio-scroll\{[\s\S]*overflow:visible!important/);
});

test('v351 PWA launch palette matches the canonical application canvas',async()=>{
  const [manifestText,bootstrap,theme,palette]=await Promise.all([
    read('public/manifest.webmanifest'),
    read('public/theme-bootstrap-v347.js'),
    read('src/lib/ui-theme.ts'),
    read('src/styles/v346-template-color-visual-closeout.css')
  ]);
  const manifest=JSON.parse(manifestText);
  assert.equal(manifest.background_color,'#081321');
  assert.equal(manifest.theme_color,'#081321');
  assert.match(bootstrap,/dark='#081321',light='#f4f7fb'/);
  assert.match(theme,/light:'#f4f7fb',dark:'#081321'/);
  assert.match(palette,/--ft-canvas:#f4f7fb!important/);
  assert.match(palette,/--ft-canvas:#081321!important/);
});
