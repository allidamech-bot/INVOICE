import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile('src/components/EditorPageCore.tsx','utf8');

test('autosave completion cannot mark newer in-flight edits as saved by timestamp collision',()=>{
  const flow=source.slice(source.indexOf('private save=async(auto=false)=>'),source.indexOf('private saveAndClose='));
  assert.match(flow,/const revisionAtStart=this\.editRevision/);
  assert.match(flow,/const hasNewerChanges=this\.editRevision!==revisionAtStart/);
  assert.match(flow,/hasNewerChanges\?'unsaved':'saved'/);
  assert.match(flow,/if\(!hasNewerChanges\)return;[\s\S]*this\.schedule\(\)/);
});

test('back action waits for a stable latest snapshot before leaving the editor',()=>{
  const flow=source.slice(source.indexOf('private saveAndClose=async()=>'),source.indexOf('private openReview='));
  assert.match(flow,/for\(;;\)/);
  assert.match(flow,/const snapshot=structuredClone\(this\.state\.doc\)/);
  assert.match(flow,/await this\.props\.onSave\(snapshot,true\)/);
  assert.match(flow,/if\(this\.editRevision!==revisionAtStart\)continue/);
  assert.match(flow,/this\.props\.onClose\(\)/);
});

test('issuing prevents late editor changes from racing the final snapshot',()=>{
  assert.match(source,/fieldset className="editor-form-lock" disabled=\{locked\|\|this\.state\.issuing\}/);
});
