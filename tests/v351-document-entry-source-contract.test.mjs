import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v351 source document runtime matches the canonical production owner set and boot palette',async()=>{
  const runtime=await read('public/document-entry-v302.js');
  for(const retired of ['attachment-gallery-v304.css','mobile-layout-closeout-v305.css','release-hardening-v306.css'])assert.doesNotMatch(runtime,new RegExp(retired.replaceAll('.','\\.')));
  assert.doesNotMatch(runtime,/#0c111d|#f9fafb/);
  assert.match(runtime,/const bootBackground=dark\?'#081321':'#f4f7fb';/);
  assert.match(runtime,/ensureStylesheet\(draftScrollRecoveryStyleMarker,'\.\/styles\/v331-draft-scroll-recovery\.css\?v=337-3'\)/);
  assert.match(runtime,/ensureStylesheet\(criticalDocumentsStyleMarker,'\.\/styles\/v332-critical-documents-deep-closeout\.css\?v=332-1'\)/);
  const promoteTail=runtime.indexOf('promoteTailAdminOwners();');
  const promoteDraft=runtime.indexOf('promoteDraftRecovery();',promoteTail);
  const promoteCritical=runtime.indexOf('promoteCriticalDocuments();',promoteDraft);
  assert.ok(promoteTail>=0&&promoteDraft>promoteTail&&promoteCritical>promoteDraft,'runtime owner promotion must remain TailAdmin -> v331 -> v332');
});
