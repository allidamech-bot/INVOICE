import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('new quote and invoice drafts are persisted immediately when the editor opens',async()=>{
  const editor=await read('src/components/EditorPage.tsx');
  assert.match(editor,/private ensureInitialDraftPersisted=\(\)=>/);
  assert.match(editor,/this\.props\.documents\.some\(item=>item\.id===doc\.id\)/);
  assert.match(editor,/this\.saveWithProtectedRetry\(structuredClone\(doc\),true\)/);
  assert.match(editor,/componentDidMount\(\):void\{[\s\S]*this\.ensureInitialDraftPersisted\(\)/);
  assert.match(editor,/prevProps\.document\.id!==this\.props\.document\.id[\s\S]*this\.ensureInitialDraftPersisted\(\)/);
  assert.match(editor,/Unable to save the new draft locally/);
});

test('desktop A4 preview takes a fresh editor snapshot when an iPad crosses the desktop breakpoint',async()=>{
  const core=await read('src/components/EditorPageCore.tsx');
  assert.match(core,/private handlePreviewMedia=\(event:MediaQueryListEvent\)=>this\.setState\(state=>\(\{desktopPreview:event\.matches,previewDoc:event\.matches\?structuredClone\(state\.doc\):state\.previewDoc\}\)\)/);
  assert.match(core,/if\(!this\.state\.desktopPreview\)return/);
  assert.match(core,/TemplateRenderer document=\{this\.state\.previewDoc\} scale=\{0\.82\}/);
});

test('document runtime changes ship through the explicit-update PWA cache generation',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/^const CACHE = 'lourex-invoice-v166';$/m);
  assert.ok(sw.includes('./src/components/EditorPage.js'));
  assert.ok(sw.includes('./src/components/EditorPageCore.js'));
  assert.match(sw,/SKIP_WAITING/);
});
