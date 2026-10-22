import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('v590 autosave persists without rebinding the active editor document prop',async()=>{
  const app=await readFile('src/app/App.tsx','utf8');
  assert.match(app,/postIssuedInvoiceStock/);
  assert.match(app,/await this\.persist\(\{\.\.\.stock\.vault,documents,documentEvents,appSettings\}\);/);
  assert.match(app,/if\(!auto\)this\.setState\(\{editorDoc:saved\}\);if\(!auto\)this\.showToast/);
});

test('v590 A4 pagination ignores autosave-only document identity churn',async()=>{
  const renderer=await readFile('src/templates/TemplateRenderer.tsx','utf8');
  assert.match(renderer,/function documentRenderSignature\(doc:LourexDocument\):string/);
  assert.match(renderer,/JSON\.stringify\(\{\.\.\.doc,updatedAt:'',attachments:\[\]\}\)/);
  assert.match(renderer,/private renderSignature=documentRenderSignature\(this\.props\.document\)/);
  assert.match(renderer,/const nextSignature=documentRenderSignature\(this\.props\.document\)/);
  assert.match(renderer,/if\(nextSignature!==this\.renderSignature\)/);
  assert.doesNotMatch(renderer,/previous\.document!==this\.props\.document/);
});


test('Batch 2 ignores clone-only company prop churn during autosave',async()=>{
  const editor=await readFile('src/components/EditorPageCore.tsx','utf8');
  assert.match(editor,/function sameDraftCompanySource\(previous:CompanySettings,next:CompanySettings\):boolean/);
  assert.match(editor,/JSON\.stringify\(previous\)===JSON\.stringify\(next\)/);
  assert.match(editor,/sameDraftCompanySource\(prevProps\.company,this\.props\.company\)/);
  assert.doesNotMatch(editor,/prevProps\.company!==this\.props\.company&&this\.state\.doc\.status==='draft'/);
});
