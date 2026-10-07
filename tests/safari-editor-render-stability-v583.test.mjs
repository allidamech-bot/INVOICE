import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('v583 autosave persists without rebinding the active editor document prop',async()=>{
  const app=await readFile('src/app/App.tsx','utf8');
  assert.match(app,/await this\.persist\(\{\.\.\.vault,documents,documentEvents,appSettings\}\);if\(!auto\)this\.setState\(\{editorDoc:updated\}\);if\(!auto\)this\.showToast/);
});

test('v583 A4 pagination ignores autosave-only document identity churn',async()=>{
  const renderer=await readFile('src/templates/TemplateRenderer.tsx','utf8');
  assert.match(renderer,/function documentRenderSignature\(doc:LourexDocument\):string/);
  assert.match(renderer,/JSON\.stringify\(\{\.\.\.doc,updatedAt:'',attachments:\[\]\}\)/);
  assert.match(renderer,/private renderSignature=documentRenderSignature\(this\.props\.document\)/);
  assert.match(renderer,/const nextSignature=documentRenderSignature\(this\.props\.document\)/);
  assert.match(renderer,/if\(nextSignature!==this\.renderSignature\)/);
  assert.doesNotMatch(renderer,/previous\.document!==this\.props\.document/);
});
