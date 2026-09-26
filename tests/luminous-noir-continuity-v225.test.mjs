import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

/* Historical filename retained so existing test discovery remains stable.
   The v228 Matte Black/Luminous Noir visual generation is retired; this file now
   protects the v351 single-owner startup/theme contract that replaced it. */

test('v351 uses one canonical light/dark canvas from bootstrap through runtime theme sync',async()=>{
  const [bootstrap,theme,palette,guard]=await Promise.all([
    read('public/theme-bootstrap-v347.js'),
    read('src/lib/ui-theme.ts'),
    read('src/styles/v346-template-color-visual-closeout.css'),
    read('public/home-final-closeout-v286.js')
  ]);

  assert.match(bootstrap,/dark='#081321',light='#f4f7fb'/);
  assert.match(theme,/THEME_COLORS:Record<ResolvedUiTheme,string>=\{light:'#f4f7fb',dark:'#081321'\}/);
  assert.doesNotMatch(theme,/#080808|#061820|#f2f7f8/);
  assert.match(palette,/--ft-canvas:#f4f7fb!important/);
  assert.match(palette,/--ft-canvas:#081321!important/);
  assert.match(guard,/background=dark\?'#081321':'#f4f7fb'/);
  assert.doesNotMatch(guard,/ensureStylesheet|appendChild\(link\)|appendChild\(.*tailadmin/i);
});

test('v351 keeps one production CSS bundle plus only intentional standalone document owners',async()=>{
  const [build,entry,attachment304,attachment305,attachment306]=await Promise.all([
    read('scripts/build.mjs'),
    read('public/document-entry-v302.js'),
    read('public/attachment-gallery-v304.css'),
    read('public/mobile-layout-closeout-v305.css'),
    read('public/release-hardening-v306.css')
  ]);

  assert.match(build,/const standaloneRuntimeStyles=new Set\(\[\s*'v331-draft-scroll-recovery\.css',\s*'v332-critical-documents-deep-closeout\.css'/);
  assert.match(build,/const paletteOwner='v346-template-color-visual-closeout\.css'/);
  assert.match(build,/app\.bundle\.css/);
  assert.match(entry,/v331-draft-scroll-recovery\.css\?v=337-3/);
  assert.match(entry,/v332-critical-documents-deep-closeout\.css\?v=332-1/);
  for(const css of [attachment304,attachment305,attachment306]){
    assert.match(css,/compatibility stub/i);
    assert.doesNotMatch(css,/\{[^}]*:[^}]*\}/);
  }
});

test('v351 final reliability layer keeps touch targets and recovery surfaces theme-native',async()=>{
  const [reliability,pull,finalizer]=await Promise.all([
    read('src/styles/tailadmin-reliability-bridge-v320.css'),
    read('src/styles/pull-to-refresh-v86.css'),
    read('scripts/v347-startup-finalize.mjs')
  ]);

  assert.match(reliability,/\.app-recovery button\{min-height:44px!important/);
  assert.match(reliability,/\.template-favorite-button\{width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important\}/);
  assert.match(reliability,/\.lourex-advisor-compose form>button\{width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important\}/);
  assert.match(pull,/background:var\(--ft-surface/);
  assert.match(finalizer,/theme-bootstrap-v347\.js\?v=351/);
  assert.match(finalizer,/home-final-closeout-v286\.js\?v=351/);
});
