import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('production HTML uses one bundled first-paint owner and ordered document styles',async()=>{
  const [html,css]=await Promise.all([read('dist/index.html'),read('dist/styles/app.bundle.css')]);
  const links=[...html.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/styles\/([^"?]+\.css)(?:\?[^"]*)?"[^>]*\/>/g)].map(match=>match[1]);
  assert.deepEqual(links,[
    'app.bundle.css',
    'v331-draft-scroll-recovery.css',
    'v332-critical-documents-deep-closeout.css',
    'v482-mobile-ux-repair.css'
  ],`Production CSS must remain stable from first paint, never load extra visual layers: ${JSON.stringify(links)}`);
  for(const filename of ['v330-critical-documents-closeout.css','tailadmin-ai-v320.css','tailadmin-ai-finish-v320.css']){
    const marker=`/* --- ${filename} --- */`;
    assert.equal(css.split(marker).length-1,1,`Single production owner required: ${filename}`);
  }
});

test('production document owner is fully compiled before first paint',async()=>{
  const [css,builder]=await Promise.all([
    read('dist/styles/v331-draft-scroll-recovery.css'),
    read('package.json')
  ]);
  assert.doesNotMatch(css,/@import\\b/,'Document CSS must not wait for nested network requests during render');
  const expected=[
    'v333-critical-documents-visual-functional-closeout.css',
    'v364-document-template-layout-refinement.css',
    'v365-mobile-editor-scroll-draft-templates.css',
    'v337-template-layout-balance.css'
  ];
  let last=-1;
  for(const filename of expected){
    const i=css.indexOf(`/* document dependency: ${filename} */`);
    assert.ok(i>last,`Missing or out-of-order compiled document dependency: ${filename}`);
    last=i;
  }
  const script=JSON.parse(builder).scripts.build;
  assert.ok(script.indexOf('v321-production-runtime-contract.mjs')<script.indexOf('v604-flatten-document-css.mjs'));
  assert.ok(script.indexOf('v604-flatten-document-css.mjs')<script.indexOf('v347-startup-finalize.mjs'));
});

test('production runtime cannot re-promote CSS link nodes after initial rendering',async()=>{
  const runtime=await read('dist/document-entry-v302.js');
  assert.match(runtime,/let stylesheetOrderPrepared=false;/);
  assert.match(runtime,/if\(!stylesheetOrderPrepared\)\{/);
  assert.match(runtime,/stylesheetOrderPrepared=true;/);
  const handler=runtime.slice(runtime.indexOf('function ensureRuntimeReliability(){'),runtime.indexOf('function editorOrUnsafeWorkspaceOpen()'));
  assert.ok(handler.includes('if(!document.querySelector('),'Production bundle must already supply its stylesheet owners');
  assert.equal((handler.match(/promoteTailAdminOwners\(\);/g)||[]).length,1);
  assert.equal((handler.match(/promoteDraftRecovery\(\);/g)||[]).length,1);
  assert.equal((handler.match(/promoteCriticalDocuments\(\);/g)||[]).length,1);
});

test('approved template gallery does not ship a competing late generic column rule',async()=>{
  const [base,late]=await Promise.all([
    read('dist/styles/app.bundle.css'),
    read('dist/styles/v365-mobile-editor-scroll-draft-templates.css')
  ]);
  const ownerStart=base.indexOf('/* --- v330-critical-documents-closeout.css --- */');
  assert.ok(ownerStart>=0,'Approved template CSS must be bundled before editor render');
  const owned=base.slice(ownerStart,base.indexOf('/* --- v330-template-contrast-guard.css --- */',ownerStart));
  assert.match(owned,/\.screen-editor \.template-selector \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.doesNotMatch(owned,/\.screen-editor \.template-selector \{ grid-template-columns:minmax\(0,1fr\)!important/);
  assert.doesNotMatch(late,/html body \.app-ui \.screen-editor \.template-selector\s*\{/);
});
