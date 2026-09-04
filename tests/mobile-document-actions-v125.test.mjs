import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v125 pins the body portal sheet to the bottom viewport without RTL inset resets',async()=>{
  const css=await read('src/styles/mobile-document-actions-v125.css');
  const html=await read('index.html');

  assert.match(css,/\.mobile-document-action-sheet[\s\S]*?top:auto!important[\s\S]*?right:12px!important[\s\S]*?bottom:max\(12px,env\(safe-area-inset-bottom\)\)!important[\s\S]*?left:12px!important/);
  assert.doesNotMatch(css,/inset-inline\s*:/);
  assert.doesNotMatch(css,/inset-block-(?:start|end)\s*:/);
  assert.match(css,/\.mobile-document-action-sheet\.action-menu/);
  assert.match(css,/\.mobile-document-action-sheet button[\s\S]*?position:relative!important/);

  const oldIndex=html.indexOf('mobile-document-actions-v124.css');
  const newIndex=html.indexOf('mobile-document-actions-v125.css');
  assert.ok(oldIndex>=0&&newIndex>oldIndex,'v125 must load after v124');
});

test('v125 keeps the action portal visible wherever the tablet three-dot trigger replaces desktop actions',async()=>{
  const [css,appCss]=await Promise.all([
    read('src/styles/mobile-document-actions-v125.css'),
    read('src/styles/app.css')
  ]);

  assert.match(appCss,/@media\(max-width:900px\)[\s\S]*?\.document-actions\{display:none\}[\s\S]*?\.mobile-actions\{display:block\}/);
  assert.match(css,/@media \(max-width:900px\)\{[\s\S]*?\.mobile-document-action-portal\{[\s\S]*?display:block!important/);
});
