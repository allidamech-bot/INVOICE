import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v219 holds a durable reload guard for the complete editor lifetime',async()=>{
  const [editor,index,freshness,pull]=await Promise.all([
    read('src/components/EditorPage.tsx'),
    read('src/app/index.tsx'),
    read('src/cloud/freshness.ts'),
    read('public/pull-to-refresh.js')
  ]);
  assert.match(editor,/activeEditorAttribute='data-lourex-document-editor'/);
  assert.match(editor,/componentDidMount[\s\S]*setAttribute\(EditorPage\.activeEditorAttribute,this\.props\.document\.id\)/);
  assert.match(editor,/componentDidUpdate[\s\S]*setAttribute\(EditorPage\.activeEditorAttribute,this\.props\.document\.id\)/);
  assert.match(editor,/componentWillUnmount[\s\S]*removeAttribute\(EditorPage\.activeEditorAttribute\)/);
  assert.match(index,/isDocumentEditorOpen[\s\S]*hasAttribute\('data-lourex-document-editor'\)/);
  assert.match(freshness,/appIsSafeToApply[\s\S]*hasAttribute\('data-lourex-document-editor'\)[\s\S]*return false/);
  assert.match(pull,/canStart[\s\S]*hasAttribute\('data-lourex-document-editor'\)[\s\S]*return false/);
});

test('v219 publishes the editor continuity guard to installed clients',async()=>{
  const [sw,patch]=await Promise.all([read('public/sw.js'),read('scripts/pwa-cache-v205.mjs')]);
  assert.match(sw,/v219 editor continuity/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v219'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v218'.*legacy marker/);
  assert.match(patch,/v219 keeps automatic reloads blocked/);
});
