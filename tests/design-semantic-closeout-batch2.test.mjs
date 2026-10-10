import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('existing final owner provides complete semantic roles and scales without another visual layer',async()=>{
 const css=await readFile('src/styles/v485-visible-ui-corrections.css','utf8');
 for(const role of ['canvas','surface','card','elevated','interactive','overlay','primary','success','warning','danger','info','muted'])assert.ok(css.includes(`--lx-ui-${role}:`),role);
 for(const token of ['space-1','space-2','space-3','space-4','space-5','radius-control','radius-card','radius-sheet','control-height','control-height-dock','type-caption','type-body','type-input','type-section','type-title','font-arabic'])assert.ok(css.includes(`--lx-ui-${token}:`),token);
 assert.match(css,/--lx-ui-control-height:44px/);
 assert.match(css,/--lx-ui-font-arabic:var\(--lx485-arabic\)/);
 assert.match(css,/\.global-search-close\{[^}]*border-radius:var\(--lx-ui-radius-control\)/);
 assert.match(css,/#lourex-ai-panel\{z-index:var\(--lourex-z-ai,1220\)!important;?\}/);
 assert.match(css,/\.lourex-ai-backdrop\{z-index:calc\(var\(--lourex-z-ai,1220\) - 1\)!important;?\}/);
 assert.match(css,/\.modal-backdrop\{z-index:var\(--lourex-z-modal,1300\)!important/);
 assert.match(css,/z-index:var\(--lourex-z-editor-dock,900\)!important/);
 assert.doesNotMatch(css,/max-height:calc\(100dvh - 24px[^}]*border-radius:24px/,'superseded mobile modal height must not remain a competing declaration');
 const pkg=JSON.parse(await readFile('package.json','utf8'));
 assert.doesNotMatch(pkg.scripts.build,/v486|v483-bundle-mobile-density/);
});
