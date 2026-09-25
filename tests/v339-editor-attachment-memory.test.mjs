import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v339 build avoids duplicating attachment payloads when opening an existing document editor',async()=>{
  const [script,app,documents]=await Promise.all([
    read('scripts/v339-ipados-desktop-stability.mjs'),
    read('dist/src/app/App.js'),
    read('src/lib/documents.ts')
  ]);
  assert.match(script,/const appTarget='dist\/src\/app\/App\.js'/);
  assert.match(script,/editorDoc:\{\.\.\.structuredClone\(\{\.\.\.doc,attachments:\[\]\}\),attachments:\(doc\.attachments\?\?\[\]\)\.map\(attachment=>\(\{\.\.\.attachment\}\)\)\}/);
  assert.doesNotMatch(app,/editorDoc:structuredClone\(doc\)/);
  assert.match(app,/editorDoc:\{\.\.\.structuredClone\(\{\.\.\.doc,attachments:\[\]\}\),attachments:\(doc\.attachments\?\?\[\]\)\.map\(attachment=>\(\{\.\.\.attachment\}\)\)\}/);
  // Keep the editor clone aligned with the established LOUREX document clone
  // contract: attachment metadata objects are copied, immutable dataUrl strings
  // are shared, and the surrounding document graph is deep-cloned separately.
  assert.match(documents,/const attachmentRefs=\(source\.attachments\?\?\[\]\)\.map\(attachment=>\(\{\.\.\.attachment\}\)\)/);
  assert.match(documents,/structuredClone\(\{\.\.\.source,attachments:\[\]\}\)/);
});