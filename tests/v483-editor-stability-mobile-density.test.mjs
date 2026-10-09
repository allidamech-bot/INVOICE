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

test('v483 creates durable numbered and customer drafts before editor opens, with no mount write loop',async()=>{
  const [app,editor]=await Promise.all([read('src/app/App.tsx'),read('src/components/EditorPage.tsx')]);
  const create=app.slice(app.indexOf('private newDocument=async('),app.indexOf('private newDocumentForCustomer=async('));
  const customer=app.slice(app.indexOf('private newDocumentForCustomer=async('),app.indexOf('private saveDocument=async('));
  for(const section of [create,customer]){
    assert.match(section,/if\(this\.documentCreateBusy\|\|!confirmWorkspaceDeparture\(\)\)return/);
    assert.match(section,/this\.documentCreateBusy=true/);
    assert.match(section,/await reservation/);
    const saved=section.indexOf('await this.persist(');
    const opened=section.indexOf("this.setState({screen:'editor'");
    assert.ok(saved>=0&&opened>saved,'complete local persistence before rendering editor');
    assert.match(section,/catch\(e\)\{document\.documentElement\.removeAttribute\('data-lourex-document-editor'\)/);
    assert.match(section,/finally\{this\.documentCreateBusy=false;\}/);
  }
  assert.match(customer,/applyCustomerCommercialDefaults/);
  assert.match(customer,/documents:\[\.\.\.vault\.documents,prepared\]/);
  assert.match(create,/documents:\[\.\.\.vault\.documents,doc\]/);
  assert.doesNotMatch(editor,/ensureInitialDraftPersisted|initialDraftPersistIds/,'mount must not duplicate a saved draft or reserve a second number');
  assert.match(editor,/private saveWithProtectedRetry=async\(doc:LourexDocument,auto\?:boolean\)/);
});
test('compact Documents geometry has one final owner after retiring v483',async()=>{
  const [pkg,css,bundle,standalone]=await Promise.all([
    read('package.json'),
    read('src/styles/v485-visible-ui-corrections.css'),
    read('dist/styles/app.bundle.css'),
    read('dist/styles/v482-mobile-ux-repair.css')
  ]);
  const scripts=JSON.parse(pkg).scripts;
  const build=String(scripts?.build||'');
  assert.ok(!build.includes('scripts/v483-bundle-mobile-density.mjs'),'retired density layer must not execute');
  assert.match(css,/\.ta-documents-header-actions>:is\(button,\.btn\)\{[\s\S]*?min-height:44px!important/,'Documents creation commands lost their accessible touch height');
  assert.match(css,/\.ta-documents-header h1\{[\s\S]*?font-size:25px!important/,'Documents title remains oversized on phone');
  assert.match(css,/\.ta-doc-search\{[\s\S]*?min-height:54px!important/,'Documents search geometry is not bounded');
  for(const content of [bundle,standalone]){
    assert.ok(!content.includes('/* --- v483-mobile-density.css --- */'),'retired owner leaked into production');
    assert.equal(content.split('/* --- v485-visible-ui-corrections.css --- */').length-1,1,'final owner must be emitted exactly once per artifact');
  }
});
