import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

const html=await read('index.html');
const coherence=await read('src/styles/hostinger-final-coherence-v356.css');
const palette=await read('src/styles/v346-template-color-visual-closeout.css');
const reliability=await read('src/styles/tailadmin-reliability-bridge-v320.css');

function stylesheetNames(source){
  return [...source.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/styles\/([^"?]+\.css)(?:\?[^\"]*)?"[^>]*\/>/g)].map(match=>match[1]);
}

test('v356 Hostinger visual owners load once and before the reliability bridge',()=>{
  const names=stylesheetNames(html);
  for(const name of [
    'hostinger-inspired-v353.css',
    'hostinger-premium-closeout-v354.css',
    'hostinger-system-contract-v355.css',
    'hostinger-final-coherence-v356.css'
  ]){
    assert.equal(names.filter(value=>value===name).length,1,`${name} must load exactly once`);
  }
  assert.equal(names.at(-1),'tailadmin-reliability-bridge-v320.css','reliability bridge must remain the final stylesheet');
  assert.ok(names.indexOf('hostinger-final-coherence-v356.css')<names.indexOf('tailadmin-reliability-bridge-v320.css'));
  assert.doesNotMatch(html,/hostinger-final-polish-v356\.css/,'deleted duplicate v356 layer must not return');
});

test('v356 closes the loaded-app canvas, account grid and mobile settings contracts',()=>{
  assert.match(coherence,/--ft-canvas:var\(--ft-workspace\)!important/);
  assert.match(coherence,/\.ta-settings-shell\.is-account\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(coherence,/\.ta-settings-shell\.is-account>\.ta-settings-content\{[\s\S]*?grid-column:1!important/);
  assert.match(coherence,/@media screen and \(max-width:720px\)[\s\S]*?\.ta-settings-nav button\{[\s\S]*?min-width:120px!important[\s\S]*?min-height:54px!important/);
  assert.match(coherence,/\.modal\{[\s\S]*?border-width:1px!important[\s\S]*?outline:0!important/);
});

test('canonical application palette is violet in both light and dark modes',()=>{
  assert.match(palette,/html\[data-ui-theme="light"\][\s\S]*?--ft-accent:#673de6!important/);
  assert.match(palette,/html\[data-ui-theme="dark"\][\s\S]*?--ft-accent:#9279ff!important/);
  assert.match(palette,/html\[data-ui-theme\] body \.app-ui \.ta-shell,[\s\S]*?background-color:var\(--ft-workspace\)!important/);
  assert.match(coherence,/\.ta-kpi-card:first-child \.ta-kpi-icon\{[\s\S]*?background:var\(--ft-accent\)!important/);
});

test('v356 preserves the canonical overlay ladder instead of reviving retired z-index hacks',()=>{
  assert.doesNotMatch(coherence,/--lourex-z-/);
  assert.doesNotMatch(coherence,/z-index\s*:/i);
  assert.match(reliability,/--lourex-z-modal:1300/);
  assert.match(reliability,/--lourex-z-critical:1500/);
  assert.match(reliability,/\.modal-backdrop\{z-index:var\(--lourex-z-modal\)!important\}/);
  assert.match(reliability,/\.app-ui \.ta-doc-mobile-action-portal\{z-index:var\(--lourex-z-critical\)!important\}/);
});
