import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v338 More menu owns a stable Safari/WebKit vertical scroll viewport',async()=>{
  const css=await read('src/styles/v331-draft-scroll-recovery.css');
  const marker='/* LOUREX v338 — More menu only.';
  const start=css.indexOf(marker);
  assert.notEqual(start,-1,'v338 More-menu recovery block is missing');
  const block=css.slice(start);

  assert.match(block,/\.ta-mobile-sheet#ta-mobile-more\s*\{/);
  assert.match(block,/height:min\(620px,calc\(100svh - 116px/);
  assert.match(block,/min-height:0!important/);
  assert.match(block,/max-height:none!important/);
  assert.match(block,/display:block!important/);
  assert.match(block,/overflow-x:hidden!important/);
  assert.match(block,/overflow-y:scroll!important/);
  assert.match(block,/-webkit-overflow-scrolling:touch!important/);
  assert.match(block,/overscroll-behavior-y:contain!important/);
  assert.match(block,/touch-action:pan-y!important/);
  assert.match(block,/contain:layout paint!important/);
  assert.match(block,/@media screen and \(max-width:900px\) and \(max-height:520px\)/);
});

test('v338 More-menu fix remains scoped to the existing More dialog',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  assert.match(shell,/id="ta-mobile-more" role="dialog" aria-modal="true"/);
  assert.match(shell,/aria-controls="ta-mobile-more" aria-expanded=\{this\.state\.moreOpen\}/);

  const css=await read('src/styles/v331-draft-scroll-recovery.css');
  const start=css.indexOf('/* LOUREX v338 — More menu only.');
  const block=css.slice(start);
  const scopedSelectors=[...block.matchAll(/html body \.app-ui ([^{]+)\{/g)].map(match=>match[1].trim());
  assert.ok(scopedSelectors.length>=3,'expected explicit More-menu scoped selectors');
  for(const selector of scopedSelectors){
    assert.match(selector,/\.ta-mobile-sheet#ta-mobile-more/,'v338 selector escaped the More menu scope');
  }
});
