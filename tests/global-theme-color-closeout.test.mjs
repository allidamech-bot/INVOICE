import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const palette=await read('src/styles/v346-template-color-visual-closeout.css');
const utilities=await read('src/styles/hostinger-system-contract-v355.css');
const darkMap=await read('src/styles/matte-black-dark-v360.css');
const responsive=await read('src/styles/premium-ux-coherence-v362.css');
const finalOwner=await read('src/styles/v485-visible-ui-corrections.css');
const bundler=await read('scripts/v485-bundle-visible-ui.mjs');

const paletteToken=/--ft-(?:canvas|shell|workspace|surface(?:-2|-3)?|input|text(?:-strong|-soft)?|muted|faint|line(?:-strong)?|accent(?:-hover|-soft|-faint)?|on-accent|success(?:-soft)?|warning(?:-soft)?|danger(?:-soft)?|info(?:-soft)?|focus)\s*:/i;

test('v346 is the single application palette owner and downstream owners consume it',()=>{
  assert.match(palette,/One palette owner only/);
  for(const [name,source] of [['v355 utilities',utilities],['v360 dark mapping',darkMap],['v362 responsive',responsive],['v485 final geometry',finalOwner]]){
    assert.doesNotMatch(source,paletteToken,`${name} must consume canonical tokens instead of redefining them`);
  }
  assert.match(finalOwner,/--lx485-canvas:var\(--ft-canvas\)/);
  assert.match(finalOwner,/--lx485-surface-3:var\(--ft-surface-3\)/);
  assert.match(bundler,/final geometry owner must not redefine canonical FT palette tokens/);
});

test('dark mode uses layered navy-green surfaces instead of stacked black',()=>{
  assert.match(palette,/html\[data-ui-theme="dark"\][\s\S]*?--ft-canvas:#071113!important/);
  assert.match(palette,/--ft-shell:#0D191C!important/);
  assert.match(palette,/--ft-surface:#122126!important/);
  assert.match(palette,/--ft-surface-2:#17292E!important/);
  assert.match(palette,/--ft-surface-3:#1C3035!important/);
  assert.match(palette,/--ft-input:#0D191C!important/);
  assert.doesNotMatch(darkMap,/#0d0d0d|#101010|#161616|#181818|#191919|#202020|#242424|#292929/i);
  assert.doesNotMatch(responsive,/#0d0d0d|#101010|#161616|#191919|#202020|#282828|#292929/i);
});

test('light mode has visible cool surface separation and no white-on-white contract',()=>{
  assert.match(palette,/html\[data-ui-theme="light"\][\s\S]*?--ft-workspace:#F5F8F9!important/);
  assert.match(palette,/--ft-surface:#FFFFFF!important/);
  assert.match(palette,/--ft-surface-2:#EEF3F4!important/);
  assert.match(palette,/--ft-surface-3:#E8EFF0!important/);
  assert.match(palette,/--ft-text-strong:#102126!important/);
  assert.match(palette,/--ft-line:#DDE5E7!important/);
});

test('primary and semantic colors keep distinct jobs',()=>{
  assert.match(palette,/--ft-accent:#315DA8!important/);
  assert.match(palette,/html\[data-ui-theme="dark"\][\s\S]*?--ft-accent:#3A68B8!important/);
  assert.match(palette,/--ft-on-accent:#FFFFFF!important/);
  assert.match(palette,/html\[data-ui-theme="dark"\][\s\S]*?--ft-success:#4BC89B!important/);
  assert.match(palette,/--ft-warning:#E3A145!important/);
  assert.match(palette,/--ft-danger:#F06B72!important/);
  assert.match(palette,/--ft-info:#5AB9CF!important/);
  assert.doesNotMatch(palette,/--ft-success:#D2D2D2|--ft-warning:#EF737A/i);
});

test('final visible UI has no legacy gold purple or gradient button palette',()=>{
  assert.doesNotMatch(finalOwner,/#(?:c79347|c49a56|9b89df|8e91d5|9690df|619dff|3975e8|326fe6|2459c4|5998ff)/i);
  assert.doesNotMatch(finalOwner,/linear-gradient\([^)]*#(?:619dff|3975e8|326fe6|2459c4|5998ff)/i);
  assert.match(finalOwner,/\.btn\.btn-primary[\s\S]*?background:var\(--ft-accent\)!important/);
  assert.match(finalOwner,/\.ta-attention-list>button[\s\S]*?background:var\(--ft-warning-soft\)!important/);
  assert.match(finalOwner,/\.ta-doc-status\.status-ready[\s\S]*?color:var\(--ft-success\)!important/);
});

test('downstream visual owners use tokens rather than repainting the application',()=>{
  assert.match(darkMap,/background:var\(--ft-canvas\)!important/);
  assert.match(darkMap,/background:var\(--ft-surface\)!important/);
  assert.match(darkMap,/background:var\(--ft-accent-soft\)!important;[\s\S]*?color:var\(--ft-accent\)!important/);
  assert.match(responsive,/background:var\(--ft-surface-2\)!important/);
  assert.match(responsive,/border-color:var\(--ft-accent\)!important/);
  assert.match(utilities,/background:var\(--ft-accent\)!important/);
  assert.doesNotMatch(utilities,/#673de6|#9279ff|#8064f4|#9a84ff/i);
  assert.match(finalOwner,/Workspace headers and cards are flat surfaces with clear hierarchy/);
  assert.match(finalOwner,/background:var\(--ft-surface\)!important/);
});
