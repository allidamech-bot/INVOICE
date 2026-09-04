import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v125 is the sole runtime action layer and pins the body portal to the viewport',async()=>{
  const css=await read('src/styles/mobile-document-actions-v125.css');
  const html=await read('index.html');

  assert.match(css,/\.mobile-document-action-sheet,[\s\S]*?top:auto!important[\s\S]*?right:12px!important[\s\S]*?bottom:max\(12px,env\(safe-area-inset-bottom\)\)!important[\s\S]*?left:12px!important/);
  assert.doesNotMatch(css,/inset-inline\s*:/);
  assert.doesNotMatch(css,/inset-block-(?:start|end)\s*:/);
  assert.match(css,/\.mobile-document-action-sheet\.action-menu/);
  assert.match(css,/\.mobile-document-action-sheet button[\s\S]*?position:relative!important/);

  for(const retired of ['mobile-document-actions-v122.css','mobile-document-actions-v123.css','mobile-document-actions-v124.css']){
    assert.equal(html.includes(retired),false,`${retired} must not execute in the runtime cascade`);
  }
  assert.match(html,/mobile-document-actions-v125\.css/);
});

test('v125 keeps the action portal visible wherever the tablet three-dot trigger replaces desktop actions',async()=>{
  const [css,appCss]=await Promise.all([
    read('src/styles/mobile-document-actions-v125.css'),
    read('src/styles/app.css')
  ]);

  assert.match(appCss,/@media\(max-width:900px\)[\s\S]*?\.document-actions\{display:none\}[\s\S]*?\.mobile-actions\{display:block\}/);
  assert.match(css,/@media \(max-width:900px\)\{[\s\S]*?\.mobile-document-action-portal\{[\s\S]*?display:block!important/);
  assert.match(css,/html\[dir='rtl'\][\s\S]*?direction:rtl!important/);
});
