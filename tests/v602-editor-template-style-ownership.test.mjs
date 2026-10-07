import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('approved mobile template gallery has one stable first-paint grid owner',async()=>{
  const [bundledOwner,lateRecovery,draftRecovery,html]=await Promise.all([
    read('src/styles/v330-critical-documents-closeout.css'),
    read('src/styles/v365-mobile-editor-scroll-draft-templates.css'),
    read('src/styles/v331-draft-scroll-recovery.css'),
    read('index.html')
  ]);
  assert.match(html,/v330-critical-documents-closeout\.css/);
  assert.match(bundledOwner,/\.screen-editor \.template-selector \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important;gap:10px!important; \}/);
  // The imported v365 runtime arrives later: it must never change global gallery columns.
  assert.doesNotMatch(lateRecovery,/html body \.app-ui \.screen-editor \.template-selector\s*\{/);
  // Draft Studio retains only its intentionally scoped two-column refinement.
  assert.match(draftRecovery,/\.ta-draft-studio-workspace \.draft-pdf-design-section \.template-selector\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
});

test('document entry locks CSS order before repeated React reconciliation',async()=>{
  const entry=await read('public/document-entry-v302.js');
  const start=entry.indexOf('function ensureRuntimeReliability(){');
  const end=entry.indexOf('function editorOrUnsafeWorkspaceOpen()',start);
  assert.ok(start>0&&end>start,'document stylesheet bootstrap must be present');
  const bootstrap=entry.slice(start,end);
  assert.match(entry,/let stylesheetOrderPrepared=false;/);
  assert.match(bootstrap,/if\(!stylesheetOrderPrepared\)\{/);
  assert.match(bootstrap,/ensureStylesheet\(draftScrollRecoveryStyleMarker/);
  assert.match(bootstrap,/ensureStylesheet\(criticalDocumentsStyleMarker/);
  assert.match(bootstrap,/if\(!document\.querySelector\('link\[rel="stylesheet"\]\[href\*="app\.bundle\.css"\]'\)\)\{/);
  assert.match(bootstrap,/stylesheetOrderPrepared=true;/);
  assert.equal((bootstrap.match(/promoteTailAdminOwners\(\)/g)||[]).length,1);
  assert.equal((bootstrap.match(/promoteDraftRecovery\(\)/g)||[]).length,1);
  assert.equal((bootstrap.match(/promoteCriticalDocuments\(\)/g)||[]).length,1);
});
