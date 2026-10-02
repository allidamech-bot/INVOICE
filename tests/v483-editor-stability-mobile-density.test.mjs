import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v483 prevents scoped company identity churn from feeding the editor save loop',async()=>{
  const [editor,workspaces]=await Promise.all([
    read('src/components/EditorPage.tsx'),
    read('src/lib/workspaces.ts')
  ]);
  assert.match(workspaces,/company:structuredClone\(workspace\.company\)/,'scopeVault clone behavior changed; revisit the editor identity guard');
  assert.match(editor,/function sameEditorCompany\(a:CompanySettings,b:CompanySettings\):boolean/,'editor company content guard is missing');
  assert.match(editor,/private stableEditorCompany:CompanySettings/,'editor does not retain a stable company reference');
  assert.match(editor,/private editorCompany=\(company:CompanySettings\):CompanySettings=>/,'stable editor company selector is missing');
  assert.match(editor,/if\(!sameEditorCompany\(this\.stableEditorCompany,company\)\)this\.stableEditorCompany=company/,'editor company reference changes without a real settings change');
  assert.match(editor,/<EditorPageCore[^>]*\.\.\.props[^>]*company=\{company\}/s,'EditorPageCore does not receive the stabilized company object');
});

test('v483 no longer writes a new document merely because the editor opened',async()=>{
  const editor=await read('src/components/EditorPage.tsx');
  assert.doesNotMatch(editor,/ensureInitialDraftPersisted/,'new documents still perform implicit draft persistence on mount');
  assert.doesNotMatch(editor,/initialDraftPersisted/,'legacy implicit-draft persistence state remains active');
  assert.match(editor,/private saveWithProtectedRetry=async\(doc:LourexDocument,auto\?:boolean\)/,'explicit editor persistence path was removed');
});

test('v483 owns compact Documents geometry after v482 in production',async()=>{
  const [pkg,css,bundler]=await Promise.all([
    read('package.json'),
    read('src/styles/v483-mobile-density.css'),
    read('scripts/v483-bundle-mobile-density.mjs')
  ]);
  const scripts=JSON.parse(pkg).scripts;
  const build=String(scripts?.build||'');
  assert.ok(build.indexOf('scripts/v483-bundle-mobile-density.mjs')>build.indexOf('scripts/v482-bundle-mobile-ux-repair.mjs'),'v483 density owner must run after v482');
  assert.match(css,/\.ta-documents-header-actions\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/,'Documents creation commands are not locked to the compact two-column mobile grid');
  assert.match(css,/\.ta-documents-header-actions>:is\(button,\.btn\)\{[\s\S]*?min-height:48px!important/,'Documents creation commands lost their compact accessible touch height');
  assert.match(css,/\.ta-documents-header h1\{[\s\S]*?font-size:27px!important/,'Documents title remains oversized on phone');
  assert.match(css,/\.ta-doc-search\{[\s\S]*?min-height:54px!important/,'Documents search geometry is not bounded');
  assert.match(bundler,/for\(const path of \[bundlePath,standalonePath\]\)/,'v483 density owner is not emitted to both production CSS paths');
  assert.match(bundler,/duplicate owner marker/,'v483 build does not reject duplicate cascade ownership');
});
