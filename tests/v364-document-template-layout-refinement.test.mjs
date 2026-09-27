import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v364 commercial templates keep the closing zone anchored and premium',async()=>{
  const css=await read('src/styles/v364-document-template-layout-refinement.css');
  const owner=await read('src/styles/v337-template-layout-balance.css');
  assert.match(owner,/@import url\("\.\/v364-document-template-layout-refinement\.css\?v=364-1"\);/);
  assert.match(css,/\.invoice-page \.final-details\{[\s\S]*margin-top:auto;/);
  assert.match(css,/\.invoice-page \.lower-grid\{[\s\S]*grid-template-columns:minmax\(0,1fr\) minmax\(61mm,67mm\)/);
  assert.match(css,/\.invoice-page \.totals-block\{[\s\S]*border-top:1\.05mm solid var\(--template-accent\)/);
  assert.match(css,/\.invoice-page \.doc-footer\{[\s\S]*height:11mm/);
  assert.match(css,/@media print[\s\S]*\.invoice-page \.final-details/);
});

test('v364 pagination avoids routine standalone closing pages',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer,/if\(pressure>1900\)return 3;/);
  assert.match(renderer,/if\(pressure>850\)return 6;/);
  assert.match(renderer,/const hardOverflow=detailsChars>1900/);
  assert.match(renderer,/const exceptionalClosing=score>=18/);
  assert.match(renderer,/const itemPages = paginateItems\(outputItems, !separateDetails,/);
});
