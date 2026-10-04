import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [theme,bundler]=await Promise.all([
  readFile('src/styles/v485-theme-color-closeout.css','utf8'),
  readFile('scripts/v485-bundle-visible-ui.mjs','utf8'),
]);

test('v485 theme closeout completes the accepted navy/light surface hierarchy without a new runtime owner',()=>{
  for(const token of [
    '--ft-canvas:var(--lx485-canvas)!important',
    '--ft-shell:var(--lx485-canvas-2)!important',
    '--ft-surface:var(--lx485-surface)!important',
    '--ft-surface-2:var(--lx485-surface-2)!important',
    '--ft-surface-3:var(--lx485-surface-3)!important',
    '--ft-input:var(--lx485-canvas-2)!important',
  ])assert.ok(theme.includes(token),token);
  assert.doesNotMatch(theme,/#000000|#000\b|#0d0d0d|#101010|#161616|#191919|#202020|#282828/i);
  assert.doesNotMatch(theme,/\.invoice-page|@media\s+print|@page/);
});

test('v485 theme closeout restores semantic color ownership instead of gray/red collapse',()=>{
  for(const token of [
    '--lx485-success:#49b98d','--lx485-warning:#e3ab52','--lx485-danger:#f06d7c',
    '--lx485-success:#238462','--lx485-warning:#ad741d','--lx485-danger:#c94f62',
    '--ft-success:var(--lx485-success)!important','--ft-warning:var(--lx485-warning)!important','--ft-danger:var(--lx485-danger)!important',
  ])assert.ok(theme.includes(token),token);
});

test('v485 bundler emits theme closeout inside the existing canonical owner exactly once',()=>{
  assert.match(bundler,/themePath='src\/styles\/v485-theme-color-closeout\.css'/);
  assert.match(bundler,/themeMarker='\/\* --- v485-theme-color-closeout\.css --- \*\/'/);
  assert.match(bundler,/const css=`\$\{baseCss\}\\n\\n\$\{themeMarker\}\\n\$\{themeCss\}`/);
  assert.match(bundler,/canonical owner marker must be emitted exactly once/);
  assert.doesNotMatch(bundler,/global-theme-color-contract-v367/);
});
