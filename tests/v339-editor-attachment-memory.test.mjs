import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v339 build avoids duplicating attachment payloads in editor and A4 output snapshots',async()=>{
  const [script,app,documents,documentsPage]=await Promise.all([
    read('scripts/v339-ipados-desktop-stability.mjs'),
    read('dist/src/app/App.js'),
    read('src/lib/documents.ts'),
    read('src/components/DocumentsPage.tsx')
  ]);
  assert.match(script,/const appTarget='dist\/src\/app\/App\.js'/);
  assert.match(script,/__lourexCloneDocumentWithAttachmentRefs/);
  assert.match(script,/__lourexOutputDocument/);

  assert.doesNotMatch(app,/editorDoc:structuredClone\(doc\)/);
  assert.match(app,/editorDoc:__lourexCloneDocumentWithAttachmentRefs\(doc\)/);
  assert.match(app,/function __lourexCloneDocumentWithAttachmentRefs\(doc\)/);
  assert.match(app,/structuredClone\(\{\.\.\.doc,attachments:\[\]\}\)/);
  assert.match(app,/attachments=\(doc\.attachments\?\?\[\]\)\.map\(attachment=>\(\{\.\.\.attachment\}\)\)/);

  // A4 templates do not render supporting attachments. Final output snapshots
  // must therefore carry no attachment payload, while the issue/save clone keeps
  // attachment refs so issuing a draft never deletes its supporting files.
  assert.match(app,/function __lourexOutputDocument\(doc\)/);
  assert.match(app,/target=__lourexOutputDocument\(doc\)/);
  assert.match(app,/target=\{\.\.\.__lourexCloneDocumentWithAttachmentRefs\(doc\),status:'final'/);
  assert.match(app,/target=__lourexOutputDocument\(this\.requireVault\(\)\.documents\.find\(saved=>saved\.id===target\.id\)\?\?target\)/);
  assert.match(documentsPage,/attachments are supporting files and are not part/);
  assert.match(documentsPage,/const outputDocument=doc\.attachments\?\.length\?\{\.\.\.doc,attachments:\[\]\}:doc/);

  // Keep the editor clone aligned with the established LOUREX document clone
  // contract: attachment metadata objects are copied, immutable dataUrl strings
  // are shared, and the surrounding document graph is deep-cloned separately.
  assert.match(documents,/const attachmentRefs=\(source\.attachments\?\?\[\]\)\.map\(attachment=>\(\{\.\.\.attachment\}\)\)/);
  assert.match(documents,/structuredClone\(\{\.\.\.source,attachments:\[\]\}\)/);
});