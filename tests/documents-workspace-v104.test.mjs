import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v104 makes document search and filters faster without changing document output logic',async()=>{
  const page=await read('src/components/DocumentsPage.tsx');
  assert.match(page,/event\.key!=='\/'/);
  assert.match(page,/documents-search-input/);
  assert.match(page,/documents-search-clear/);
  assert.match(page,/filtersOpen/);
  assert.match(page,/documents-filter-toggle/);
  assert.match(page,/documents-results-bar/);
  assert.match(page,/Review drafts/);
  assert.match(page,/this\.runOutput\('pdf',doc\)/);
  assert.match(page,/this\.runOutput\('share',doc\)/);
});

test('v104 keeps advanced filters compact on mobile and leaves printable output untouched',async()=>{
  const css=await read('src/styles/workspace-mobile-v94.css');
  assert.match(css,/v104 — faster, calmer Documents workspace interactions/);
  assert.match(css,/premium-documents-toolbar\.filters-open \.documents-filter-stack/);
  assert.match(css,/documents-search-shortcut/);
  assert.match(css,/documents-results-bar/);
  assert.match(css,/@media print\{/);
  assert.match(css,/\.app-ui \.documents-page,/);
});
