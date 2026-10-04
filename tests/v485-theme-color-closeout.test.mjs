import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [theme,bundler]=await Promise.all([
  readFile('src/styles/v485-theme-color-closeout.css','utf8'),
  readFile('scripts/v485-bundle-visible-ui.mjs','utf8'),
]);

function luminance(hex){
  const values=hex.replace('#','').match(/../g).map(value=>parseInt(value,16)/255);
  const linear=values.map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
  return 0.2126*linear[0]+0.7152*linear[1]+0.0722*linear[2];
}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}

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
    '--lx485-success:#1f785b','--lx485-warning:#9b6110','--lx485-danger:#b94357',
    '--ft-success:var(--lx485-success)!important','--ft-warning:var(--lx485-warning)!important','--ft-danger:var(--lx485-danger)!important',
  ])assert.ok(theme.includes(token),token);
  assert.match(theme,/\.ta-report-kpi-secondary>span\.is-danger :is\(small,b\)[\s\S]*?color:var\(--lx485-danger\)!important/);
  assert.match(theme,/\.kpi-overdue :is\(\.dashboard-kpi-icon,small,\.dashboard-money-stack b\)[\s\S]*?color:var\(--lx485-danger\)!important/);
  assert.doesNotMatch(theme,/\[role=["']alert["']\]/,'ARIA alert alone must not imply danger color');
});

test('v485 light colored inks meet AA contrast on near-white surfaces',()=>{
  for(const token of ['--lx485-blue:#3f70c5','--lx485-muted:#5e748e'])assert.ok(theme.includes(token),token);
  for(const [foreground,background,label] of [
    ['#3f70c5','#ffffff','primary blue'],
    ['#5e748e','#ffffff','muted text'],
    ['#1f785b','#e4f4ed','success'],
    ['#9b6110','#fff2dc','warning'],
    ['#b94357','#fdecef','danger'],
  ])assert.ok(contrast(foreground,background)>=4.5,`${label} contrast must be >= 4.5:1`);
});

test('v485 bundler emits theme closeout inside the existing canonical owner exactly once',()=>{
  assert.match(bundler,/themePath='src\/styles\/v485-theme-color-closeout\.css'/);
  assert.match(bundler,/themeMarker='\/\* --- v485-theme-color-closeout\.css --- \*\/'/);
  assert.match(bundler,/const css=`\$\{baseCss\}\\n\\n\$\{themeMarker\}\\n\$\{themeCss\}`/);
  assert.match(bundler,/canonical owner marker must be emitted exactly once/);
  assert.doesNotMatch(bundler,/global-theme-color-contract-v367/);
});
