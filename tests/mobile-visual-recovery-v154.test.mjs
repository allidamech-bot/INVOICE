import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v154 removes the editor sticky gap and contains all mobile text',async()=>{
  const css=await read('src/styles/ux-recovery-v152.css');
  assert.match(css,/app-header:has\(\.header-editor-context\)\{[\s\S]*min-height:64px!important/);
  assert.match(css,/\.app-ui \.editor-topbar\{[\s\S]*position:relative!important;[\s\S]*height:52px!important/);
  assert.match(css,/\.app-ui \.editor-layout\{[^}]*overflow:hidden!important/);
  assert.match(css,/\.app-ui \.editor-pane \.editor-scroll\{[^}]*overflow-y:auto!important;[^}]*overflow-x:hidden!important/);
  assert.match(css,/editor-nav-label\{[^}]*text-overflow:ellipsis/);
  assert.match(css,/document-info-top strong\{[^}]*text-overflow:ellipsis/);
});

test('v154 gives editor dates a stable iPhone label while retaining native picking',async()=>{
  const [editor,css]=await Promise.all([
    read('src/components/EditorPageCore.tsx'),
    read('src/styles/ux-recovery-v152.css')
  ]);
  assert.match(editor,/function EditorDateInput/);
  assert.match(editor,/displayDate\(props\.value,getUiLanguage\(\)\)/);
  assert.equal((editor.match(/<EditorDateInput/g)||[]).length,2);
  assert.match(editor,/type="date"/);
  assert.match(css,/\.app-ui \.editor-date-value\{display:block/);
  assert.match(css,/editor-date-control input\[type="date"\][^}]*opacity:\.001/);
});

test('v154 introduces compact accented rows without touching printable templates',async()=>{
  const css=await read('src/styles/ux-recovery-v152.css');
  for(const selector of ['premium-document-card','premium-customer-card','receivable-account-row','operation-row','product-library-row::before'])assert.ok(css.includes(selector),selector);
  assert.match(css,/\.app-ui :is\(\.empty-state,[^}]*min-height:104px!important/);
  assert.match(css,/\.app-ui \.operations-summary>div\{[^}]*min-height:62px!important/);
  assert.doesNotMatch(css,/\n\.invoice-page/);
  assert.doesNotMatch(css,/\n\.document-page/);
});
