import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v339 regular document editor publishes the root editor marker for its full mount lifetime',async()=>{
  const source=await read('src/components/EditorPage.tsx');
  assert.match(source,/activeEditorAttribute='data-lourex-document-editor'/);
  assert.match(source,/componentDidMount\(\)[\s\S]*setAttribute\(EditorPage\.activeEditorAttribute,this\.props\.document\.id\)/);
  assert.match(source,/componentWillUnmount\(\)[\s\S]*removeAttribute\(EditorPage\.activeEditorAttribute\)/);
});

test('v339 Draft editor publishes the same root editor marker',async()=>{
  const source=await read('src/components/DraftDocumentEditor.tsx');
  assert.match(source,/componentDidMount\(\)[\s\S]*setAttribute\('data-lourex-document-editor'/);
  assert.match(source,/componentWillUnmount\(\)[\s\S]*removeAttribute\('data-lourex-document-editor'\)/);
});
